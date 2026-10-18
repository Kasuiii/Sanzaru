import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("export_asl", Path(__file__).resolve().parents[1] / "scripts/export-asl-onnx.py")
export = importlib.util.module_from_spec(spec)
spec.loader.exec_module(export)


class ExportTests(unittest.TestCase):
    def test_preserve_class_order(self):
        self.assertEqual(export.mapped_labels({2: "A", 0: "Z", 1: "J", 3: "B", 4: "C"}), ["Z", "J", "A", "B", "C"])

    def test_exact_mapping(self):
        names = ["a-sign", "B", "C", "J", "Z", "nothing"]
        self.assertEqual(export.mapped_labels(names, dict(zip(names, ["A", "B", "C", "J", "Z", None])))[-1], None)
        with self.assertRaises(ValueError):
            export.mapped_labels(names)
        with self.assertRaises(ValueError):
            export.mapped_labels(names, {"a-sign": "A"})

    def test_formats_and_rejections(self):
        self.assertEqual(export.output_format([1, 300, 6], 26), "end2end")
        self.assertEqual(export.output_format([1, 30, 8400], 26), "raw-bcn")
        self.assertEqual(export.output_format([1, 8400, 30], 26), "raw-bnc")
        for shape in [[1, None, 6], [2, 300, 6], [1, 8400, 31], [1, 30, 30]]:
            with self.assertRaises(ValueError):
                export.output_format(shape, 26)


if __name__ == "__main__":
    unittest.main()
