/**
 * A byte sequence that actually starts with the PDF magic number
 * (`%PDF-`) — required since M06 added magic-byte sniffing to
 * `storeDocument()`; the arbitrary `[1, 2, 3]` bytes M05's tests used
 * before that stopped being accepted. Doesn't need to be a fully
 * parseable PDF, only to pass the sniff check `sniffFileType()` does.
 */
export const VALID_PDF_BYTES = new Uint8Array([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, // "%PDF-1.4\n"
]);

export function validPdfFile(name = "offer.pdf"): File {
  return new File([VALID_PDF_BYTES], name, { type: "application/pdf" });
}
