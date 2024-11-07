// path: /src/mod.ts

/**
 * @module lzw
 *
 * Lempel-Ziv-Welch (LZW) compression and decompression
 */

const CLEAR_CODE = 256
const EOI_CODE = 257

export class LzwError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "LzwError"
	}
}

// ---------- Compression ----------- //
class CompressionTable {
	// deno-lint-ignore no-explicit-any
	private root: Map<number, any>

	constructor() {
		this.root = new Map()
	}

	set(key: number[], value: number): void {
		let currentMap = this.root
		for (const part of key) {
			if (!currentMap.has(part)) {
				// deno-lint-ignore no-explicit-any
				currentMap.set(part, new Map<number, any>())
			}
			currentMap = currentMap.get(part)!
		}

		currentMap.set(-1, value)
	}

	get(key: number[]): number | undefined {
		let currentMap = this.root
		for (const part of key) {
			if (!currentMap.has(part)) {
				return undefined
			}
			currentMap = currentMap.get(part)!
		}

		return currentMap.get(-1)
	}

	has(key: number[]): boolean {
		return this.get(key) !== undefined
	}

	clear(): void {
		this.root.clear()
	}
}

class BitStreamWriter {
	private buffer: number[] = []
	private currentByte: number = 0
	private bitsFilled: number = 0

	public write(value: number, bitCount: number): void {
		while (bitCount > 0) {
			const bitsToWrite = Math.min(bitCount, 8 - this.bitsFilled)
			const bits = (value >> (bitCount - bitsToWrite)) & ((1 << bitsToWrite) - 1)
			this.currentByte = (this.currentByte << bitsToWrite) | bits
			this.bitsFilled += bitsToWrite
			bitCount -= bitsToWrite

			if (this.bitsFilled === 8) {
				this.buffer.push(this.currentByte)
				this.currentByte = 0
				this.bitsFilled = 0
			}
		}
	}

	public toData(): Uint8Array {
		// Pad with zeros if necessary
		this.write(0, 8 - this.bitsFilled)
		return new Uint8Array(this.buffer)
	}
}

/**
 * Compresses data using the LZW (Lempel-Ziv-Welch) algorithm with variable-width codes
 *
 * This implementation uses:
 * - MSB first bit packing
 * - Variable width codes starting at 9 bits
 * - Dynamic code size expansion up to maxBits (default 12)
 * - Dictionary reset when maximum code is reached
 *
 * Format:
 * 1. CLEAR_CODE (256) is written first
 * 2. Data codes follow (9-12 bits each)
 * 3. Code size increases when next code would exceed current size
 * 4. Dictionary resets if maximum code (4095 for 12 bits) is reached
 * 5. EOI_CODE (257) marks the end
 *
 * @param data - Input data to compress
 * @param maxBits - Maximum code size in bits (default: 12)
 * @returns Compressed data as Uint8Array
 * @example
 * // Compress simple repeated data
 * const input = new Uint8Array([0x41, 0x41, 0x41, 0x41, 0x41, 0x42, 0x42, 0x42])
 * const compressed = compress(input)
 * // Result contains: [0x80, 0x10, 0x60, 0x50, 0x22, 0x14, 0x16, 0x02]
 *
 * // Compress with custom maximum bits
 * const maxBits = 10 // Smaller dictionary, more frequent resets
 * const compressed2 = compress(input, maxBits)
 */
export function compress(data: Uint8Array, maxBits: number = 12): Uint8Array {
	const table = new CompressionTable()
	const bitWriter = new BitStreamWriter()
	let codeSize = 9 // Initial code size
	let nextCode = 258 // 0-255: single bytes, 256: ClearCode, 257: EOI

	const initializeStringTable = () => {
		table.clear()
		for (let i = 0; i < 256; i += 1) {
			table.set([i], i)
		}
	}

	initializeStringTable()
	bitWriter.write(CLEAR_CODE, codeSize)

	// Early exit for empty input
	if (data.length === 0) {
		bitWriter.write(EOI_CODE, codeSize)
		return bitWriter.toData()
	}

	let omega: number[] = []

	for (const k of data) {
		const omegaK = [...omega, k]

		if (table.has(omegaK)) {
			omega = omegaK
		} else {
			bitWriter.write(table.get(omega)!, codeSize)

			if (nextCode < 1 << maxBits) {
				table.set(omegaK, nextCode++)
				if (nextCode === 1 << codeSize && codeSize < maxBits) {
					codeSize += 1
				}
			} else {
				bitWriter.write(CLEAR_CODE, codeSize)
				initializeStringTable()
				codeSize = 9
				nextCode = 258
			}

			omega = [k]
		}
	}

	bitWriter.write(table.get(omega)!, codeSize)
	bitWriter.write(EOI_CODE, codeSize)

	return bitWriter.toData()
}

// ---------- Decompression ---------- //
class BitStreamReader {
	private bitBuffer = 0
	private bitsInBuffer = 0
	private byteIndex = 0

	constructor(private data: Uint8Array) {}

	public read(bitCount: number): number | null {
		// Validate input
		if (bitCount <= 0 || bitCount > 32) {
			throw new Error(`Invalid bit count: ${bitCount}`)
		}

		// Load bytes until we have enough bits
		while (this.bitsInBuffer < bitCount && this.byteIndex < this.data.length) {
			// Shift existing bits left by 8
			this.bitBuffer = (this.bitBuffer << 8) | this.data[this.byteIndex++]
			this.bitsInBuffer += 8
		}

		// If we don't have enough bits, return null
		if (this.bitsInBuffer < bitCount) {
			return null
		}

		// Extract the desired bits
		const mask = (1 << bitCount) - 1
		const result = (this.bitBuffer >> (this.bitsInBuffer - bitCount)) & mask

		// Remove the read bits from buffer
		this.bitsInBuffer -= bitCount
		this.bitBuffer &= (1 << this.bitsInBuffer) - 1

		return result
	}
}

/**
 * Decompresses data compressed with the LZW algorithm
 *
 * Format handling:
 * - Expects MSB-first bit packing
 * - Starts with 9-bit codes after CLEAR_CODE
 * - Automatically adjusts code size up to maxBits
 * - Resets dictionary when CLEAR_CODE is encountered
 *
 * Special cases:
 * - Empty input results in empty output
 * - Single CLEAR_CODE + EOI_CODE is valid (empty content)
 *
 * @param data - LZW compressed data
 * @param maxBits - Maximum code size in bits (default: 12)
 * @returns Original decompressed data
 * @throws {LzwError} if the input data does not start with `CLEAR_CODE`
 * @example
 * // Basic decompression
 * const compressed = new Uint8Array([...]) // LZW compressed data
 * const original = decompress(compressed)
 *
 * // Decompress data with custom dictionary size
 * const maxBits = 10 // Must match compression parameter
 * const original2 = decompress(compressed, maxBits)
 */
export function decompress(data: Uint8Array, maxBits: number = 12): Uint8Array {
	const bitReader = new BitStreamReader(data)
	const output: number[] = []
	let codeSize = 9
	let nextCode = 258

	const table = new Map<number, number[]>()

	const initializeTable = () => {
		table.clear()
		for (let i = 0; i < 256; i++) {
			table.set(i, [i])
		}
	}

	const getNextCode = (): number => {
		const code = bitReader.read(codeSize)
		if (code === null) throw new LzwError(`Unexpected end of input`)
		return code
	}

	const stringFromCode = (code: number): number[] => {
		if (!table.has(code)) throw new LzwError(`Code ${code} not found in dictionary`)
		return table.get(code)!
	}

	const addStringToTable = (sequence: number[]): void => {
		if (nextCode < 1 << maxBits) {
			table.set(nextCode, sequence)
			nextCode += 1
			if (nextCode === (1 << codeSize) - 1 && codeSize < maxBits) {
				codeSize += 1
			}
		} else {
			initializeTable()
			codeSize = 9
			nextCode = 258
		}
	}

	initializeTable()

	let code = getNextCode()
	if (code !== CLEAR_CODE) {
		throw new LzwError(`Invalid LZW data: missing \`CLEAR_CODE\` at start`)
	}

	let oldCode = -1

	while (code !== EOI_CODE) {
		if (code === CLEAR_CODE) {
			initializeTable()
			codeSize = 9
			nextCode = 258
			code = getNextCode()
			if (code === EOI_CODE) break
			output.push(...stringFromCode(code))
			oldCode = code
		} else {
			if (table.has(code)) {
				output.push(...stringFromCode(code))
				addStringToTable([...stringFromCode(oldCode), stringFromCode(code)[0]])
				oldCode = code
			} else {
				const outString = [...stringFromCode(oldCode), stringFromCode(oldCode)[0]]
				output.push(...outString)
				addStringToTable(outString)
				oldCode = code
			}
		}

		code = getNextCode()
	}

	return new Uint8Array(output)
}
