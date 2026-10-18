<script>
  export let Hst
</script>

<Hst.Story
  title="Cars"
  layout={{ type: 'grid', width: 200 }}
  icon="carbon:car"
  iconColor="gray"
>
  <Hst.Variant title="default">
    <div class="example-stage">
      <span class="example-specimen">🚗</span>
    </div>
  </Hst.Variant>
  <Hst.Variant title="Fast">
    <div class="example-stage">
      <span class="example-specimen">🏎️</span>
    </div>
  </Hst.Variant>
  <Hst.Variant title="Slow">
    <div class="example-stage">
      <span class="example-specimen">🚜</span>
    </div>
  </Hst.Variant>
</Hst.Story>
