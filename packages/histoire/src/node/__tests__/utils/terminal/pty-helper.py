"""Test-only PTY bridge for the Histoire terminal integration specs.

Usage: python3 -I pty-helper.py COLUMNS ROWS -- COMMAND [ARGS...]
Control lines on stdin are JSON objects; output lines on stdout are
  O<base64>        terminal output
  T<id> <json>     termios answer
  F<json>          termios state after the command exited
  X<code>          child exit status (last line)
"""
import base64, errno, fcntl, json, os, pty, select, signal, struct, sys, termios

columns, rows = int(sys.argv[1]), int(sys.argv[2])
command = sys.argv[4:]
pid, master = pty.fork()
if pid == 0:
    fcntl.ioctl(0, termios.TIOCSWINSZ, struct.pack('HHHH', rows, columns, 0, 0))
    os.execvp(command[0], command)

def emit(line):
    sys.stdout.write(line + '\n')
    sys.stdout.flush()

def flags():
    lflag = termios.tcgetattr(master)[3]
    return json.dumps({'canonical': bool(lflag & termios.ICANON), 'echo': bool(lflag & termios.ECHO), 'signals': bool(lflag & termios.ISIG)})

def handle(message):
    if 'write' in message:
        os.write(master, base64.b64decode(message['write']))
    elif 'resize' in message:
        fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack('HHHH', message['resize'][1], message['resize'][0], 0, 0))
    elif 'termios' in message:
        emit('T%s %s' % (message['termios'], flags()))
    elif 'signal' in message:
        os.kill(pid, getattr(signal, message['signal']))

def drain():
    # Output written just before exit is still queued on the master side.
    while True:
        readable, _, _ = select.select([master], [], [], 0.05)
        if not readable:
            return
        try:
            data = os.read(master, 65536)
        except OSError:
            return
        if not data:
            return
        emit('O' + base64.b64encode(data).decode())

buffer = b''
status = None
open_input = True
try:
    while status is None:
        readable, _, _ = select.select([master] + ([0] if open_input else []), [], [], 0.05)
        if master in readable:
            try:
                data = os.read(master, 65536)
            except OSError as error:
                if error.errno != errno.EIO:
                    raise
                data = b''
            if data:
                emit('O' + base64.b64encode(data).decode())
            else:
                _, raw = os.waitpid(pid, 0)
                status = os.waitstatus_to_exitcode(raw)
                break
        if 0 in readable:
            chunk = os.read(0, 65536)
            if not chunk:
                open_input = False
                os.kill(pid, signal.SIGTERM)
            buffer += chunk
            while b'\n' in buffer:
                line, buffer = buffer.split(b'\n', 1)
                if line:
                    handle(json.loads(line))
        done, raw = os.waitpid(pid, os.WNOHANG)
        if done:
            drain()
            status = os.waitstatus_to_exitcode(raw)
finally:
    if status is None:
        try:
            os.kill(pid, signal.SIGKILL)
        except OSError:
            pass
try:
    # Terminal state the command left behind, read after it exited.
    emit('F' + flags())
except OSError:
    pass
emit('X%d' % status)
