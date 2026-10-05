# Story hierarchy

Use `title` paths to group React stories in navigation:

```tsx
<Story title="Components/Actions/Button">
  <Button>Hi</Button>
</Story>
```

Set `group` to a group id declared in [`tree.groups`](../../reference/config.md#tree-groups). Stable story and variant ids preserve preview links when titles change.
