"""Pruebas unitarias para main.py y la exportación de resultados a JSON."""

import json
import tempfile
import unittest
from pathlib import Path

from main import export_run_to_json
from src.config import NUM_SATELLITES, TARGET_REGIONS
from src.genetic_engine import (
    AstroShieldGA,
    EvolutionHistory,
    GeneticConfig,
)


class TestMainOrchestration(unittest.TestCase):
    """Verificación de la serialización y flujo del script principal."""

    def test_export_run_to_json(self) -> None:
        config = GeneticConfig(
            population_size=10,
            generations=3,
            seed=42,
        )
        ga = AstroShieldGA(config=config)
        history: EvolutionHistory = ga.run(verbose=False)

        with tempfile.TemporaryDirectory() as tmp_dir:
            out_path = Path(tmp_dir) / "output.json"
            exported = export_run_to_json(history, str(out_path), config=config)

            self.assertTrue(exported.exists())
            self.assertGreater(exported.stat().st_size, 0)

            with open(exported, "r", encoding="utf-8") as f:
                data = json.load(f)

            # Validar claves de primer nivel
            expected_keys = {
                "metadata",
                "environment",
                "initial_state",
                "final_state",
                "convergence_history",
            }
            self.assertTrue(expected_keys.issubset(data.keys()))

            # Validar metadata
            self.assertEqual(data["metadata"]["seed_used"], 42)
            self.assertEqual(data["metadata"]["parameters"]["population_size"], 10)
            self.assertEqual(data["metadata"]["parameters"]["generations"], 3)

            # Validar environment
            self.assertEqual(len(data["environment"]["target_regions"]), len(TARGET_REGIONS))
            self.assertEqual(len(data["environment"]["debris_zones"]), 3)
            self.assertEqual(len(data["environment"]["occupied_positions"]), 2)

            # Validar initial_state y final_state
            self.assertEqual(len(data["initial_state"]["satellites"]), NUM_SATELLITES)
            self.assertEqual(len(data["final_state"]["satellites"]), NUM_SATELLITES)
            self.assertIn("fitness", data["initial_state"])
            self.assertIn("fitness", data["final_state"])

            # Validar convergence_history
            self.assertEqual(len(data["convergence_history"]), 4)  # Gen 0, 1, 2, 3


if __name__ == "__main__":
    unittest.main()

