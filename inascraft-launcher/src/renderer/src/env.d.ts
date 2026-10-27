/// <reference types="vite/client" />

// Declaração para assets de imagem/fonte
declare module '*.png' {
  const src: string
  export default src
}

declare module '*.woff2' {
  const src: string
  export default src
}

declare module '*.woff' {
  const src: string
  export default src
}
