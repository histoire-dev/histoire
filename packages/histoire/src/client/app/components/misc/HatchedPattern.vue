<template>
  <svg fill="none">
    <pattern
      id="hatch"
      width="32"
      height="32"
      patternUnits="userSpaceOnUse"
    >
      <path
        d="M32,0 L0,32
           M-1,1 l2,-2
           M31,33 l2,-2"
        stroke-width="2"
        stroke="currentColor"
      />
    </pattern>
    <rect
      x="0"
      y="0"
      width="100%"
      height="100%"
      fill="url(#hatch)"
    />
  </svg>
</template>
