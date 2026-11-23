# Story hierarchy <Badge type="tip" text="1.0-beta.2+" />

Use slashes in `title` to organize React stories into folders.

```tsx
<Story title="Components/Actions/Button">
  <Button>Hi</Button>
</Story>
```

Set `group` to an ID declared in [`tree.groups`](../vue3/hierarchy.md#groups). Set stable story and variant IDs to keep existing links working when titles change.
