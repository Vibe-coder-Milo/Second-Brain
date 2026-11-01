all-MiniLM-L6-v2 (sentence-transformers, Apache-2.0), ONNX export by Xenova.
model_quantized.onnx: per-channel int8 quantization of Xenova/all-MiniLM-L6-v2 onnx/model.onnx
(sha256 759c3cd2b7fe7e93933ad23c4c9181b7396442a2ed746ec7c1d46192c469c46e, revision 751bff3),
made with onnxruntime.quantization.quantize_dynamic(per_channel=True, weight_type=QInt8).
Embeddings agree with the full-precision model to a cosine similarity of about 0.99.
