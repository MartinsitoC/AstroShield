"""Pruebas unitarias para el motor de algoritmo genético src/genetic_engine.py."""

import unittest
from src.config import Coordinates, NUM_SATELLITES
from src.genetic_engine import (
    AstroShieldGA,
    EvolutionHistory,
    GeneticConfig,
    Individual,
)


class TestGeneticEngine(unittest.TestCase):
    """Batería de pruebas para operadores genéticos y ciclo evolutivo."""

    def setUp(self) -> None:
        self.config = GeneticConfig(
            population_size=10,
            generations=5,
            crossover_rate=0.8,
            mutation_rate=0.2,
            mutation_sigma_deg=3.0,
            tournament_size=2,
            elitism_count=1,
            seed=42,
        )
        self.ga = AstroShieldGA(config=self.config)

    def test_random_individual_creation(self) -> None:
        ind = self.ga._create_random_individual()
        self.assertEqual(len(ind.satellites), NUM_SATELLITES)
        for sat in ind.satellites:
            self.assertGreaterEqual(sat.latitude, -90.0)
            self.assertLessEqual(sat.latitude, 90.0)
            self.assertGreaterEqual(sat.longitude, -180.0)
            self.assertLessEqual(sat.longitude, 180.0)
        self.assertIsNone(ind.evaluation)
        self.assertEqual(ind.fitness, -float("inf"))

    def test_evaluation_and_memoization(self) -> None:
        ind = self.ga._create_random_individual()
        eval1 = self.ga._evaluate(ind)
        self.assertIsNotNone(ind.evaluation)
        self.assertIsNotNone(eval1)
        # Segunda llamada debe retornar la misma instancia memoizada
        eval2 = self.ga._evaluate(ind)
        self.assertIs(eval1, eval2)

    def test_tournament_selection(self) -> None:
        pop = [self.ga._create_random_individual() for _ in range(5)]
        for ind in pop:
            self.ga._evaluate(ind)
        winner = self.ga._tournament_selection(pop)
        self.assertIsInstance(winner, Individual)
        self.assertEqual(len(winner.satellites), NUM_SATELLITES)

    def test_crossover_shape_preservation(self) -> None:
        p1 = self.ga._create_random_individual()
        p2 = self.ga._create_random_individual()
        c1, c2 = self.ga._crossover(p1, p2)
        self.assertEqual(len(c1.satellites), NUM_SATELLITES)
        self.assertEqual(len(c2.satellites), NUM_SATELLITES)

    def test_mutation_bounds_and_wrap(self) -> None:
        # Satélite en el borde extremo
        extreme_ind = Individual(
            satellites=[Coordinates(latitude=89.5, longitude=179.5) for _ in range(NUM_SATELLITES)]
        )
        # Configurar tasa de mutación a 1.0 para forzar perturbación
        self.ga.config.mutation_rate = 1.0
        self.ga._mutate(extreme_ind)

        for sat in extreme_ind.satellites:
            self.assertGreaterEqual(sat.latitude, -90.0)
            self.assertLessEqual(sat.latitude, 90.0)
            self.assertGreaterEqual(sat.longitude, -180.0)
            self.assertLessEqual(sat.longitude, 180.0)
        self.assertIsNone(extreme_ind.evaluation)

    def test_short_run_execution(self) -> None:
        history: EvolutionHistory = self.ga.run(log_interval=2, verbose=False)
        self.assertIsInstance(history, EvolutionHistory)
        self.assertIsNotNone(history.initial_best)
        self.assertIsNotNone(history.final_best)
        self.assertGreater(len(history.generation_records), 0)
        # Elitismo garantiza que final_best >= initial_best
        self.assertGreaterEqual(history.final_best.fitness, history.initial_best.fitness)


if __name__ == "__main__":
    unittest.main()

