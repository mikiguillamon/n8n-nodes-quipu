export function multipartFile(
	buffer: Buffer,
	filename: string,
	mimeType: string,
	bookEntryId: string,
): { body: Buffer; contentType: string } {
	let boundary = '----n8nQuipuBoundary';
	while (buffer.includes(boundary)) boundary += 'x';
	const name = filename.replace(/[\r\n"\\]/g, '_');
	const mime = /^[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+$/.test(mimeType)
		? mimeType
		: 'application/octet-stream';
	const prefix = `--${boundary}\r\nContent-Disposition: form-data; name="book_entry_id"\r\n\r\n${bookEntryId}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${mime}\r\n\r\n`;
	return {
		body: Buffer.concat([Buffer.from(prefix), buffer, Buffer.from(`\r\n--${boundary}--\r\n`)]),
		contentType: `multipart/form-data; boundary=${boundary}`,
	};
}
