// path: /src/mod.bench.ts

import { IMAGE_DATA, IMAGE_COMPRESSED } from "./fixtures.ts"
import { compress, decompress } from "./mod.ts"

Deno.bench({
	name: "Compress mixed patterns",
	fn: () => {
		compress(IMAGE_DATA)
	}
})

Deno.bench({
	name: "Decompress mixed patterns",
	fn: () => {
		decompress(IMAGE_COMPRESSED)
	}
})
