<script lang="ts">
	import { onMount } from 'svelte';
	import { spring } from 'svelte/motion';

	let count = 0;

	let reduceMotion = false;
	const displayed_count = spring(0);

	// Read live browser preference only after mount; SSR remains deterministic.
	onMount(() => {
		const media = window.matchMedia('(prefers-reduced-motion: reduce)');
		/** Updates spring policy when operating system preference changes. */
		const updateMotion = () => { reduceMotion = media.matches; };
		updateMotion();
		media.addEventListener('change', updateMotion);
		return () => media.removeEventListener('change', updateMotion);
	});
	$: displayed_count.set(count, { hard: reduceMotion });
	$: offset = modulo($displayed_count, 1);

	/** Keeps digit offset positive while decrementing through zero. */
	function modulo(n: number, m: number) {
		// handle negative numbers
		return ((n % m) + m) % m;
	}
</script>

<div class="counter" role="group" aria-label="Counter">
	<button class="example-button" type="button" on:click={() => (count -= 1)} aria-label="Decrease the counter by one">
		<svg aria-hidden="true" viewBox="0 0 1 1">
			<path d="M0,0.5 L1,0.5" />
		</svg>
	</button>

	<div class="counter-viewport">
		<div class="counter-digits" style="transform: translate(0, {100 * offset}%)">
			<strong class="hidden" aria-hidden="true">{Math.floor($displayed_count + 1)}</strong>
			<strong>{Math.floor($displayed_count)}</strong>
		</div>
	</div>

	<button class="example-button" type="button" on:click={() => (count += 1)} aria-label="Increase the counter by one">
		<svg aria-hidden="true" viewBox="0 0 1 1">
			<path d="M0,0.5 L1,0.5 M0.5,0 L0.5,1" />
		</svg>
	</button>
</div>

<style>
  .counter {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    max-width: 100%;
  }

  .counter button {
    width: 36px;
    flex-shrink: 0;
    padding: 0;
    touch-action: manipulation;
  }

  svg { width: 12px; height: 12px; }
  path { vector-effect: non-scaling-stroke; stroke-width: 2px; stroke: currentColor; }

  .counter-viewport {
    width: 3ch;
    height: 48px;
    overflow: hidden;
    text-align: center;
    position: relative;
    font-size: 28px;
    font-variant-numeric: tabular-nums;
  }

  .counter-viewport strong {
    position: absolute;
    display: flex;
    width: 100%;
    height: 100%;
    font-weight: 600;
    align-items: center;
    justify-content: center;
  }

  .counter-digits { position: absolute; width: 100%; height: 100%; }
  .hidden { top: -100%; user-select: none; }
</style>
