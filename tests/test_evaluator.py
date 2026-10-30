"""Pruebas unitarias para el módulo src/evaluator.py."""

import unittest
from typing import List

from src.config import Coordinates, NUM_SATELLITES, TARGET_REGIONS
from src.evaluator import (
    EvaluationResult,
    PENALTY_PER_VIOLATION,
    evaluate_constellation,
)


class TestEvaluator(unittest.TestCase):
    """Pruebas unitarias para el motor de evaluación de fitness y restricciones."""

    def setUp(self) -> None:
        # Constelación sintética válida con cobertura total
        self.valid_constellation: List[Coordinates] = [
            region.coordinates for region in TARGET_REGIONS
        ]
        self.valid_constellation.append(Coordinates(latitude=0.0, longitude=-20.0))
        self.valid_constellation.append(Coordinates(latitude=0.0, longitude=80.0))

    def test_invalid_constellation_size(self) -> None:
        # Menos de 8 satélites
        with self.assertRaises(ValueError):
            evaluate_constellation(self.valid_constellation[:7])

        # Más de 8 satélites
        with self.assertRaises(ValueError):
            extra = list(self.valid_constellation) + [Coordinates(latitude=0.0, longitude=0.0)]
            evaluate_constellation(extra)

    def test_perfect_coverage(self) -> None:
        result: EvaluationResult = evaluate_constellation(self.valid_constellation)
        self.assertEqual(result.fitness, 13.0)
        self.assertEqual(result.coverage_score, 13.0)
        self.assertEqual(result.total_weight_possible, 13.0)
        self.assertEqual(result.coverage_percentage, 100.0)
        self.assertEqual(len(result.covered_regions), 6)
        self.assertEqual(len(result.uncovered_regions), 0)
        self.assertEqual(result.violations_count, 0)
        self.assertEqual(len(result.violations_details), 0)
        self.assertTrue(result.is_valid)

    def test_partial_coverage(self) -> None:
        # Satélite 1 en Yucatán, los otros 7 en el océano Pacífico central (lejos de todo)
        partial_constellation: List[Coordinates] = [
            TARGET_REGIONS[0].coordinates  # Yucatán (peso 3.0)
        ] + [Coordinates(latitude=0.0, longitude=-140.0 + (i * 2.0)) for i in range(7)]

        result: EvaluationResult = evaluate_constellation(partial_constellation)
        self.assertEqual(result.coverage_score, 3.0)
        self.assertIn("Península de Yucatán, México", result.covered_regions)
        self.assertEqual(len(result.uncovered_regions), 5)
        self.assertAlmostEqual(result.coverage_percentage, (3.0 / 13.0) * 100.0, places=4)
        self.assertEqual(result.violations_count, 0)
        self.assertTrue(result.is_valid)
        self.assertEqual(result.fitness, 3.0)

    def test_debris_zone_violation(self) -> None:
        # Constelación donde un satélite invade el Atlántico Norte (45.0, -35.0)
        colliding = list(self.valid_constellation)
        colliding[0] = Coordinates(latitude=45.0, longitude=-35.0)

        result: EvaluationResult = evaluate_constellation(colliding)
        self.assertFalse(result.is_valid)
        self.assertGreaterEqual(result.violations_count, 1)
        expected_fitness = result.coverage_score - (result.violations_count * PENALTY_PER_VIOLATION)
        self.assertEqual(result.fitness, expected_fitness)
        self.assertTrue(any("Atlántico Norte" in d for d in result.violations_details))

    def test_occupied_position_violation(self) -> None:
        # Constelación donde un satélite invade el Objeto A (10.0, 45.0)
        colliding = list(self.valid_constellation)
        colliding[0] = Coordinates(latitude=10.0, longitude=45.0)

        result: EvaluationResult = evaluate_constellation(colliding)
        self.assertFalse(result.is_valid)
        self.assertGreaterEqual(result.violations_count, 1)
        self.assertTrue(any("Objeto A" in d for d in result.violations_details))


if __name__ == "__main__":
    unittest.main()

