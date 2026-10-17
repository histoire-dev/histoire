# Story hierarchy <Badge type="tip" text="1.0-beta.2+" />

Use `title` paths to group React stories in navigation:

```tsx
<Story title="Components/Actions/Button">
  <Button>Hi</Button>
</Story>
```

Set `group` to a group id declared in [`tree.groups`](../../reference/config.md#tree-groups). Stable story and variant ids preserve preview links when titles change.
