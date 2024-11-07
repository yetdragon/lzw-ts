// path: /src/mod.test.ts

import { assertEquals } from "@std/assert"

import { IMAGE_DATA, IMAGE_COMPRESSED } from "./fixtures.ts"
import { LzwError, compress, decompress } from "./mod.ts"

const TEST_CASES = [
	{
		name: `Simple data`,
		data: new Uint8Array([0x41, 0x41, 0x41, 0x41, 0x41, 0x42, 0x42, 0x42]),
		compressed: new Uint8Array([0x80, 0x10, 0x60, 0x50, 0x22, 0x14, 0x16, 0x02])
	},
	{
		name: `Image data`,
		data: IMAGE_DATA,
		compressed: IMAGE_COMPRESSED
	},
	{
		name: `Empty data`,
		data: new Uint8Array([]),
		compressed: new Uint8Array([0x80, 0x40, 0x40])
	}
]

Deno.test(`Compression`, async (t) => {
	for (const { name, data, compressed } of TEST_CASES) {
		await t.step(name, () => {
			const result = compress(data)
			assertEquals(result, compressed)
		})
	}
})

Deno.test(`Decompression`, async (t) => {
	for (const { name, data, compressed } of TEST_CASES) {
		await t.step(name, () => {
			const result = decompress(compressed)
			assertEquals(result, data)
		})
	}
})

const ERROR_CASES = [
	{
		name: `Missing \`CLEAR_CODE\` at start`,
		data: new Uint8Array([0x81, 0x40, 0x40]),
		message: `Invalid LZW data: missing \`CLEAR_CODE\` at start`
	},
	{
		name: `Unexpected end of input`,
		data: new Uint8Array([0x80, 0x40]),
		message: `Unexpected end of input`
	}
]

Deno.test(`Decompression errors`, async (t) => {
	for (const { name, data, message } of ERROR_CASES) {
		await t.step(name, () => {
			try {
				decompress(data)
				throw new Error(`Decompression should have failed`)
			} catch (error) {
				assertEquals(error instanceof LzwError, true)
				if (error instanceof LzwError) {
					assertEquals(error.message, message)
				}
			}
		})
	}
})
