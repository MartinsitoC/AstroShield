"""Motor de Algoritmo Genético para la constelación satelital AstroShield.

Optimiza las posiciones orbitales de 8 satélites para maximizar la cobertura
ponderada sobre regiones prioritarias y evitar zonas de escombros orbitales
y posiciones ocupadas.
"""

from __future__ import annotations

import copy
import random
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

# Soporte dual: importación como submódulo de paquete o ejecución directa
try:
    from src.config import (
        Coordinates,
        DebrisZone,
        OccupiedPosition,
        TargetRegion,
        NUM_SATELLITES,
        R_EARTH,
        TARGET_OBSERVATION_RADIUS_KM,
        TARGET_REGIONS,
        DEBRIS_ZONES,
        OCCUPIED_POSITIONS,
    )
    from src.evaluator import EvaluationResult, evaluate_constellation
except (ImportError, ModuleNotFoundError):
    project_root = str(Path(__file__).resolve().parent.parent)
    if project_root not in sys.path:
        sys.path.insert(0, project_root)
    from src.config import (
        Coordinates,
        DebrisZone,
        OccupiedPosition,
        TargetRegion,
        NUM_SATELLITES,
        R_EARTH,
        TARGET_OBSERVATION_RADIUS_KM,
        TARGET_REGIONS,
        DEBRIS_ZONES,
        OCCUPIED_POSITIONS,
    )
    from src.evaluator import EvaluationResult, evaluate_constellation


# ==============================================================================
# CLASES DE DATOS DEL MOTOR EVOLUTIVO
# ==============================================================================

@dataclass
class Individual:
    """Representa una constelación candidata en la población evolutiva.

    Attributes:
        satellites: Lista de coordenadas geográficas de los 8 satélites.
        evaluation: Resultado de la evaluación de cobertura y restricciones.
    """
    satellites: List[Coordinates]
    evaluation: Optional[EvaluationResult] = None

    @property
    def fitness(self) -> float:
        """Acceso directo al fitness neto del individuo evaluado."""
        return self.evaluation.fitness if self.evaluation is not None else -float("inf")


@dataclass
class GeneticConfig:
    """Parámetros de configuración e hiperparámetros del Algoritmo Genético.

    Attributes:
        population_size: Cantidad de individuos en la población.
        generations: Número máximo de generaciones a evolucionar.
        crossover_rate: Probabilidad de aplicar cruce entre dos progenitores.
        mutation_rate: Probabilidad independiente de mutación por cada gen de satélite.
        mutation_sigma_deg: Desviación estándar en grados para perturbación gaussiana.
        tournament_size: Número de candidatos por torneo de selección.
        elitism_count: Número de mejores individuos preservados intactos por generación.
        seed: Semilla para el generador pseudoaleatorio para reproducibilidad.
    """
    population_size: int = 100
    generations: int = 150
    crossover_rate: float = 0.8
    mutation_rate: float = 0.15
    mutation_sigma_deg: float = 4.0
    tournament_size: int = 3
    elitism_count: int = 2
    seed: Optional[int] = None


@dataclass
class EvolutionHistory:
    """Registro histórico de la evolución de la población a través de las generaciones.

    Attributes:
        initial_best: Mejor individuo obtenido en la población inicial (Gen 0).
        final_best: Mejor individuo obtenido al finalizar el proceso evolutivo.
        generation_records: Métricas cuantitativas registradas por generación.
    """
    initial_best: Individual
    final_best: Individual
    generation_records: List[Dict[str, Any]]


# ==============================================================================
# MOTOR DEL ALGORITMO GENÉTICO (AstroShieldGA)
# ==============================================================================

class AstroShieldGA:
    """Motor de optimización evolutiva para constelaciones de satélites AstroShield.

    Implementa un Algoritmo Genético de Valores Reales (RCGA) con selección por
    torneo, cruce uniforme a nivel satelital, mutación gaussiana acotada sobre la
    esfera y preservación elitista estricta.
    """

    def __init__(
        self,
        config: GeneticConfig,
        target_regions: Sequence[TargetRegion] = TARGET_REGIONS,
        debris_zones: Sequence[DebrisZone] = DEBRIS_ZONES,
        occupied_positions: Sequence[OccupiedPosition] = OCCUPIED_POSITIONS,
    ) -> None:
        """Inicializa el motor genético con su configuración y catálogos espaciales.

        Args:
            config: Parámetros del algoritmo genético.
            target_regions: Catálogo de regiones objetivo con prioridades.
            debris_zones: Catálogo de zonas de escombros orbitales.
            occupied_positions: Catálogo de posiciones ocupadas preexistentes.
        """
        self.config = config
        self.target_regions = target_regions
        self.debris_zones = debris_zones
        self.occupied_positions = occupied_positions

        if self.config.seed is not None:
            random.seed(self.config.seed)

    def _create_random_individual(self) -> Individual:
        """Genera un individuo aleatorio con 8 satélites sobre la esfera terrestre.

        La latitud se distribuye uniformemente en [-90.0, 90.0] y la longitud
        en [-180.0, 180.0].

        Returns:
            Nueva instancia de Individual sin evaluar.
        """
        satellites: List[Coordinates] = []
        for _ in range(NUM_SATELLITES):
            lat = random.uniform(-90.0, 90.0)
            lon = random.uniform(-180.0, 180.0)
            satellites.append(Coordinates(latitude=lat, longitude=lon))
        return Individual(satellites=satellites, evaluation=None)

    def _evaluate(self, individual: Individual) -> EvaluationResult:
        """Asigna y memoiza el resultado de la evaluación de una constelación.

        Args:
            individual: Candidato a evaluar.

        Returns:
            Resultado de la evaluación con fitness y diagnóstico detallado.
        """
        if individual.evaluation is None:
            individual.evaluation = evaluate_constellation(
                satellites=individual.satellites,
                target_regions=self.target_regions,
                debris_zones=self.debris_zones,
                occupied_positions=self.occupied_positions,
            )
        return individual.evaluation

    def _tournament_selection(self, population: List[Individual]) -> Individual:
        """Selecciona k individuos al azar y retorna una copia profunda del mejor.

        Args:
            population: Población actual evaluada.

        Returns:
            Copia profunda del individuo con mayor fitness en el torneo.
        """
        candidates = random.sample(population, self.config.tournament_size)
        winner = max(candidates, key=lambda ind: ind.fitness)
        return copy.deepcopy(winner)

    def _crossover(
        self, parent1: Individual, parent2: Individual
    ) -> Tuple[Individual, Individual]:
        """Aplica cruce uniforme a nivel de satélites con probabilidad crossover_rate.

        Intercambia satélites completos entre progenitores para preservar sub-constelaciones
        funcionales como bloques constructivos (*building blocks*). Si no se activa el cruce,
        retorna clones exactos de los padres.

        Args:
            parent1: Primer individuo progenitor.
            parent2: Segundo individuo progenitor.

        Returns:
            Tupla con los dos descendientes generados.
        """
        if random.random() < self.config.crossover_rate:
            child1_sats: List[Coordinates] = []
            child2_sats: List[Coordinates] = []

            for i in range(NUM_SATELLITES):
                if random.random() < 0.5:
                    child1_sats.append(copy.deepcopy(parent1.satellites[i]))
                    child2_sats.append(copy.deepcopy(parent2.satellites[i]))
                else:
                    child1_sats.append(copy.deepcopy(parent2.satellites[i]))
                    child2_sats.append(copy.deepcopy(parent1.satellites[i]))

            return (
                Individual(satellites=child1_sats, evaluation=None),
                Individual(satellites=child2_sats, evaluation=None),
            )

        return (copy.deepcopy(parent1), copy.deepcopy(parent2))

    def _mutate(self, individual: Individual) -> None:
        """Aplica perturbación gaussiana acotada sobre las coordenadas de cada satélite.

        Para cada satélite, con probabilidad mutation_rate:
        * Latitud: perturba con N(0, sigma) y recorta con clamp en [-90.0, 90.0].
        * Longitud: perturba con N(0, sigma) y aplica envoltura modular cíclica en [-180.0, 180.0].

        Args:
            individual: Candidato a mutar in-place.
        """
        mutated: bool = False
        sigma: float = self.config.mutation_sigma_deg

        for i in range(NUM_SATELLITES):
            if random.random() < self.config.mutation_rate:
                current_sat = individual.satellites[i]

                # Perturbación con ruido gaussiano
                delta_lat = random.gauss(0.0, sigma)
                delta_lon = random.gauss(0.0, sigma)

                # Reglas de frontera geodésica
                new_lat = max(-90.0, min(90.0, current_sat.latitude + delta_lat))
                new_lon = ((current_sat.longitude + delta_lon + 180.0) % 360.0) - 180.0

                individual.satellites[i] = Coordinates(latitude=new_lat, longitude=new_lon)
                mutated = True

        if mutated:
            individual.evaluation = None

    def run(self, log_interval: int = 25, verbose: bool = True) -> EvolutionHistory:
        """Ejecuta el ciclo generacional completo del Algoritmo Genético.

        Args:
            log_interval: Intervalo de generaciones para imprimir métricas en consola.
            verbose: Si es True, imprime la tabla de progreso durante la evolución.

        Returns:
            Objeto EvolutionHistory con los registros de cada generación y los mejores individuos.
        """
        if self.config.seed is not None:
            random.seed(self.config.seed)

        # 1. Generación e inicialización de la población
        population: List[Individual] = [
            self._create_random_individual() for _ in range(self.config.population_size)
        ]

        # 2. Evaluación inicial y ordenamiento
        for ind in population:
            self._evaluate(ind)

        population.sort(key=lambda ind: ind.fitness, reverse=True)

        initial_best = copy.deepcopy(population[0])
        generation_records: List[Dict[str, Any]] = []

        if verbose:
            print("=" * 82)
            print("                ASTROSHIELD - EJECUCION DEL ALGORITMO GENETICO                ")
            print("=" * 82)
            print(
                f" Parametros: Poblacion={self.config.population_size} | "
                f"Generaciones={self.config.generations} | Cruce={self.config.crossover_rate:.2f} | "
                f"Mutacion={self.config.mutation_rate:.2f} (sigma={self.config.mutation_sigma_deg:.1f} deg)"
            )
            print("-" * 82)
            header = f"{'Gen':>5} | {'Mejor Fit':>10} | {'Prom Fit':>9} | {'Cob Pts':>8} | {'% Cob':>6} | {'Viol':>5} | {'Valida':>6}"
            print(header)
            print("-" * 82)

        # 3. Bucle generacional
        for gen in range(self.config.generations + 1):
            # Registrar estadísticas de la generación actual
            best_ind = population[0]
            assert best_ind.evaluation is not None

            avg_fitness = sum(ind.fitness for ind in population) / len(population)
            record = {
                "gen_number": gen,
                "best_fitness": best_ind.fitness,
                "avg_fitness": avg_fitness,
                "coverage_score": best_ind.evaluation.coverage_score,
                "coverage_percentage": best_ind.evaluation.coverage_percentage,
                "violations_count": best_ind.evaluation.violations_count,
                "is_valid": best_ind.evaluation.is_valid,
            }
            generation_records.append(record)

            # Impresión periódica
            if verbose and (gen % log_interval == 0 or gen == self.config.generations):
                print(
                    f"{gen:>5} | {best_ind.fitness:>10.2f} | {avg_fitness:>9.2f} | "
                    f"{best_ind.evaluation.coverage_score:>8.2f} | {best_ind.evaluation.coverage_percentage:>5.1f}% | "
                    f"{best_ind.evaluation.violations_count:>5} | {str(best_ind.evaluation.is_valid):>6}"
                )

            # Criterio de parada temprana: solución perfecta (13.0 pts y 0 violaciones)
            if best_ind.fitness >= 13.0 and best_ind.evaluation.is_valid:
                if verbose:
                    print("-" * 82)
                    print(f" -> [ÉXITO] Óptimo global alcanzado anticipadamente en Generación {gen}!")
                break

            # Si es la última generación, no construir nueva descendencia
            if gen == self.config.generations:
                break

            # 4. Construcción de la nueva generación
            new_population: List[Individual] = []

            # 4.1. Elitismo: Clonar los mejores individuos intactos
            for elite in population[: self.config.elitism_count]:
                new_population.append(copy.deepcopy(elite))

            # 4.2. Selección, Cruce y Mutación
            while len(new_population) < self.config.population_size:
                p1 = self._tournament_selection(population)
                p2 = self._tournament_selection(population)
                c1, c2 = self._crossover(p1, p2)
                self._mutate(c1)
                self._mutate(c2)

                new_population.append(c1)
                if len(new_population) < self.config.population_size:
                    new_population.append(c2)

            # 4.3. Evaluación y ordenamiento de la nueva población
            for ind in new_population:
                self._evaluate(ind)

            new_population.sort(key=lambda ind: ind.fitness, reverse=True)
            population = new_population

        final_best = copy.deepcopy(population[0])

        if verbose:
            print("=" * 82)

        return EvolutionHistory(
            initial_best=initial_best,
            final_best=final_best,
            generation_records=generation_records,
        )


# ==============================================================================
# EJECUCIÓN PRINCIPAL Y DEMOSTRACIÓN COMPARATIVA
# ==============================================================================

def main() -> None:
    """Ejecuta una corrida experimental reproducible del Algoritmo Genético."""
    config = GeneticConfig(
        population_size=100,
        generations=150,
        crossover_rate=0.8,
        mutation_rate=0.15,
        mutation_sigma_deg=4.0,
        tournament_size=3,
        elitism_count=2,
        seed=42,
    )

    ga = AstroShieldGA(config=config)
    history = ga.run(log_interval=25, verbose=True)

    init_eval = history.initial_best.evaluation
    final_eval = history.final_best.evaluation
    assert init_eval is not None and final_eval is not None

    print("\n" + "=" * 82)
    print("                    RESUMEN COMPARATIVO DE LA EVOLUCION                     ")
    print("=" * 82)

    print("\n[A] CONFIGURACION INICIAL (Generacion 0 - Mejor Azar):")
    print(f" * Fitness Neto          : {init_eval.fitness:.2f} pts")
    print(f" * Puntuacion Cobertura  : {init_eval.coverage_score:.2f} / {init_eval.total_weight_possible:.2f} pts")
    print(f" * Porcentaje Cobertura  : {init_eval.coverage_percentage:.1f}%")
    print(f" * Regiones Observadas   : {init_eval.covered_regions if init_eval.covered_regions else 'Ninguna'}")
    print(f" * Regiones sin Cobertura: {len(init_eval.uncovered_regions)} / {len(TARGET_REGIONS)}")
    print(f" * Violaciones Detectadas: {init_eval.violations_count}")
    print(f" * Es Solucion Valida    : {init_eval.is_valid}")

    print("\n[B] CONFIGURACION FINAL OPTIMIZADA (Algoritmo Genetico):")
    print(f" * Fitness Neto          : {final_eval.fitness:.2f} pts")
    print(f" * Puntuacion Cobertura  : {final_eval.coverage_score:.2f} / {final_eval.total_weight_possible:.2f} pts")
    print(f" * Porcentaje Cobertura  : {final_eval.coverage_percentage:.1f}%")
    print(f" * Regiones Observadas   : {final_eval.covered_regions}")
    print(f" * Regiones sin Cobertura: {len(final_eval.uncovered_regions)} / {len(TARGET_REGIONS)}")
    print(f" * Violaciones Detectadas: {final_eval.violations_count}")
    print(f" * Es Solucion Valida    : {final_eval.is_valid}")

    delta_fitness = final_eval.fitness - init_eval.fitness
    print("-" * 82)
    print(f" -> Ganancia neta de fitness : +{delta_fitness:.2f} puntos")
    print(f" -> Condicion de validez     : {'[OK] Cero violaciones' if final_eval.is_valid else '[FAIL] Violaciones presentes'}")
    print("=" * 82)


if __name__ == "__main__":
    main()
