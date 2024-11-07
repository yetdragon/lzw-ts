# lzw-ts

[![JSR](https://jsr.io/badges/@yetdragon/lzw)](https://jsr.io/@yetdragon/lzw)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

A TypeScript implementation of the [Lempel–Ziv–Welch (LZW)](https://en.wikipedia.org/wiki/Lempel%E2%80%93Ziv%E2%80%93Welch) compression algorithm.

## Features

- MSB-first bit packing: Commonly used in file formats like TIFF and PDF.
- Variable-length codes: Adapts code size from 9 to 12 bits (configurable).
- Uses CLEAR (256) and EOI (257) codes as markers.

## Usage

```typescript
import { compress, decompress } from "jsr:@yetdragon/lzw"

// Example: Compressing data
const originalData = new Uint8Array([/* ... */])
const compressed = compress(originalData)
console.log("Compression ratio:", compressed.length / originalData.length)

// Example: Decompressing data
const decompressed = decompress(compressed)
console.log("Decompressed size:", decompressed.length)

// Verify roundtrip
const isEqual = originalData.every((value, index) => value === decompressed[index])
console.log("Roundtrip successful:", isEqual)
```

## License

This project is licensed under the MIT License - see the [LICENSE.txt](LICENSE.txt) file for details.
