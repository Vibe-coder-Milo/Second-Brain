PP-OCRv6 small text-line recogniser (PaddleOCR, Apache-2.0), ONNX export from
PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models (Apache-2.0), unmodified:
recognition/PP-OCRv6_small_rec.onnx -> rec.onnx, recognition/ppocrv6_dict.txt -> dict.txt.
Input: 1x3x48xW image normalised to [-1, 1]. Output: per-column probabilities over
the dictionary (index 0 is the CTC blank), decoded greedily.
Used to read handwriting on this device; nothing is sent anywhere.
