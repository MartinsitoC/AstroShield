"""Módulo de evaluación de constelaciones satelitales para AstroShield.

Calcula el desempeño de cobertura ponderada, detecta invasiones a zonas
de exclusión orbital y determina la puntuación de aptitud (fitness) neta
para algoritmos genéticos y métodos de optimización.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Final, List, Sequence

# Soporte dual: importación como paquete o ejecución directa como script
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
    from src.geometry import is_region_covered, violates_exclusion_zone
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
    from src.geometry import is_region_covered, violates_exclusion_zone


# ==============================================================================
# CONSTANTES DE EVALUACIÓN
# ==============================================================================

PENALTY_PER_VIOLATION: Final[float] = 10.0
"""Penalización severa sustraída del fitness por cada zona de exclusión invadida."""


# ==============================================================================
# ESTRUCTURA DE RESULTADOS
# ==============================================================================

@dataclass
class EvaluationResult:
    """Contenedor estructurado con las métricas y diagnóstico de una constelación.

    Attributes:
        fitness: Puntuación neta final (cobertura ponderada menos penalizaciones).
        coverage_score: Suma de los pesos de las regiones efectivamente cubiertas.
        total_weight_possible: Puntuación máxima alcanzable según prioridades (ej. 13.0).
        coverage_percentage: Porcentaje relativo de cobertura ponderada [0.0, 100.0]%.
        covered_regions: Nombres de las regiones terrestres observadas con éxito.
        uncovered_regions: Nombres de las regiones que quedaron sin cobertura.
        violations_count: Cantidad total de invasiones a zonas restringidas.
        violations_details: Descripción textual de cada violación detectada.
        is_valid: True si y solo si violations_count == 0 (solución sin colisiones).
    """
    fitness: float
    coverage_score: float
    total_weight_possible: float
    coverage_percentage: float
    covered_regions: List[str]
    uncovered_regions: List[str]
    violations_count: int
    violations_details: List[str]
    is_valid: bool


# ==============================================================================
# FUNCIÓN PRINCIPAL DE EVALUACIÓN
# ==============================================================================

def evaluate_constellation(
    satellites: Sequence[Coordinates],
    target_regions: Sequence[TargetRegion] = TARGET_REGIONS,
    debris_zones: Sequence[DebrisZone] = DEBRIS_ZONES,
    occupied_positions: Sequence[OccupiedPosition] = OCCUPIED_POSITIONS,
) -> EvaluationResult:
    """Evalúa la cobertura y restricciones de seguridad de una constelación.

    Calcula la cobertura ponderada de las regiones objetivo y comprueba la
    ausencia de colisiones contra zonas de escombros orbitales y satélites
    preexistentes. Aplica una penalización lineal severa por cada transgresión.

    Args:
        satellites: Colección de coordenadas subsatelitales (debe contener exactamente NUM_SATELLITES).
        target_regions: Catálogo de regiones objetivo con prioridades (por defecto TARGET_REGIONS).
        debris_zones: Catálogo de zonas de escombros con radio angular (por defecto DEBRIS_ZONES).
        occupied_positions: Catálogo de posiciones ocupadas (por defecto OCCUPIED_POSITIONS).

    Returns:
        Instancia de EvaluationResult con el desglose cuantitativo y cualitativo.

    Raises:
        ValueError: Si el número de satélites difiere de NUM_SATELLITES (8).
    """
    if len(satellites) != NUM_SATELLITES:
        raise ValueError(
            f"La constelación debe contener exactamente {NUM_SATELLITES} satélites. "
            f"Se recibieron {len(satellites)}."
        )

    # --------------------------------------------------------------------------
    # 1. EVALUACIÓN DE COBERTURA TERRESTRE
    # --------------------------------------------------------------------------
    covered_regions: List[str] = []
    uncovered_regions: List[str] = []
    coverage_score: float = 0.0

    for region in target_regions:
        # Se considera cubierta si al menos un satélite está a distancia <= TARGET_OBSERVATION_RADIUS_KM
        is_covered: bool = any(
            is_region_covered(sat_pos=sat, region_pos=region.coordinates)
            for sat in satellites
        )

        if is_covered:
            covered_regions.append(region.name)
            coverage_score += region.weight
        else:
            uncovered_regions.append(region.name)

    total_weight_possible: float = sum(region.weight for region in target_regions)
    coverage_percentage: float = (
        (coverage_score / total_weight_possible * 100.0)
        if total_weight_possible > 0.0
        else 0.0
    )

    # --------------------------------------------------------------------------
    # 2. EVALUACIÓN DE RESTRICCIONES DE EXCLUSIÓN ORBITAL
    # --------------------------------------------------------------------------
    violations_count: int = 0
    violations_details: List[str] = []

    for sat_idx, sat in enumerate(satellites, start=1):
        # A) Zonas de basura espacial (DEBRIS_ZONES)
        for zone in debris_zones:
            if violates_exclusion_zone(sat, zone.coordinates, zone.radius_deg):
                violations_count += 1
                violations_details.append(
                    f"Satelite #{sat_idx} ({sat.latitude:.2f} deg, {sat.longitude:.2f} deg) "
                    f"invade zona de escombros '{zone.name}' (centro: {zone.lat:.2f} deg, "
                    f"{zone.lon:.2f} deg, radio: {zone.radius_deg:.1f} deg)"
                )

        # B) Posiciones ocupadas preexistentes (OCCUPIED_POSITIONS)
        for obj in occupied_positions:
            if violates_exclusion_zone(sat, obj.coordinates, obj.radius_deg):
                violations_count += 1
                violations_details.append(
                    f"Satelite #{sat_idx} ({sat.latitude:.2f} deg, {sat.longitude:.2f} deg) "
                    f"invade posicion ocupada '{obj.name}' (centro: {obj.lat:.2f} deg, "
                    f"{obj.lon:.2f} deg, radio: {obj.radius_deg:.1f} deg)"
                )

    # --------------------------------------------------------------------------
    # 3. CÁLCULO DE FITNESS NETO
    # --------------------------------------------------------------------------
    total_penalty: float = violations_count * PENALTY_PER_VIOLATION
    fitness: float = coverage_score - total_penalty
    is_valid: bool = (violations_count == 0)

    return EvaluationResult(
        fitness=fitness,
        coverage_score=coverage_score,
        total_weight_possible=total_weight_possible,
        coverage_percentage=coverage_percentage,
        covered_regions=covered_regions,
        uncovered_regions=uncovered_regions,
        violations_count=violations_count,
        violations_details=violations_details,
        is_valid=is_valid,
    )


# ==============================================================================
# AUTOVERIFICACIÓN Y DIAGNÓSTICO
# ==============================================================================

def run_self_check() -> None:
    """Ejecuta los dos casos de prueba estándar requeridos para certificar el evaluador."""
    separator_double = "=" * 80
    separator_single = "-" * 80

    print(separator_double)
    print("            ASTROSHIELD - VERIFICACIÓN DEL EVALUADOR DE FITNESS            ")
    print(separator_double)

    # --------------------------------------------------------------------------
    # CASO 1: Solución Sintética Perfecta y Válida
    # 6 satélites sobre los centros de las 6 regiones objetivo
    # 2 satélites auxiliares en posiciones seguras en aguas internacionales
    # --------------------------------------------------------------------------
    print("[CASO 1] Solución Sintética Perfecta (6 regiones + 2 satélites neutros):")

    perfect_constellation: List[Coordinates] = [
        region.coordinates for region in TARGET_REGIONS
    ]
    # Posiciones neutras alejadas de toda restricción
    perfect_constellation.append(Coordinates(latitude=0.0, longitude=-20.0))  # Atlántico Ecuatorial
    perfect_constellation.append(Coordinates(latitude=0.0, longitude=80.0))   # Océano Índico

    res1 = evaluate_constellation(perfect_constellation)

    print(f" * Fitness neto          : {res1.fitness:.2f} pts (Esperado: 13.00)")
    print(f" * Puntuación cobertura  : {res1.coverage_score:.2f} / {res1.total_weight_possible:.2f} pts")
    print(f" * Porcentaje cobertura  : {res1.coverage_percentage:.1f}%")
    print(f" * Regiones cubiertas    : {len(res1.covered_regions)} / {len(TARGET_REGIONS)}")
    print(f" * Violaciones detectadas: {res1.violations_count}")
    print(f" * Es solución válida    : {res1.is_valid}")

    assert res1.fitness == 13.0, f"Fallo fitness Caso 1: {res1.fitness} != 13.0"
    assert res1.coverage_percentage == 100.0, "Fallo porcentaje Caso 1: != 100%"
    assert res1.violations_count == 0, f"Fallo violaciones Caso 1: {res1.violations_count} != 0"
    assert res1.is_valid is True, "Fallo validez Caso 1: no es válida"
    assert len(res1.uncovered_regions) == 0, "Fallo regiones descubiertas Caso 1"
    print(" -> [PASS] Caso 1 superado exitosamente.")
    print(separator_single)

    # --------------------------------------------------------------------------
    # CASO 2: Solución con Invasión en Zona de Basura Espacial
    # Modificamos el satélite 1 situándolo en el centro del Atlántico Norte (45.0, -35.0)
    # --------------------------------------------------------------------------
    print("[CASO 2] Solucion con Invasion en Debris 'Atlantico Norte' (45.0 deg, -35.0 deg):")

    colliding_constellation: List[Coordinates] = list(perfect_constellation)
    # Forzar invasión del primer satélite en el centro de escombros del Atlántico Norte
    colliding_constellation[0] = Coordinates(latitude=45.0, longitude=-35.0)

    res2 = evaluate_constellation(colliding_constellation)

    print(f" * Fitness neto          : {res2.fitness:.2f} pts")
    print(f" * Puntuación cobertura  : {res2.coverage_score:.2f} / {res2.total_weight_possible:.2f} pts")
    print(f" * Porcentaje cobertura  : {res2.coverage_percentage:.1f}%")
    print(f" * Violaciones detectadas: {res2.violations_count}")
    print(f" * Es solución válida    : {res2.is_valid}")
    print(" * Detalle de violaciones :")
    for detail in res2.violations_details:
        print(f"   - {detail}")

    assert res2.violations_count >= 1, "Fallo: la colisión en Debris no fue detectada"
    assert res2.is_valid is False, "Fallo: una solución con colisión no debe ser válida"
    assert res2.fitness == (res2.coverage_score - (res2.violations_count * PENALTY_PER_VIOLATION)), (
        f"Fallo en cálculo de penalización: {res2.fitness}"
    )
    print(" -> [PASS] Caso 2 superado exitosamente.")
    print(separator_double)
    print("  [OK] Todas las verificaciones del evaluador finalizaron con éxito.")
    print(separator_double)


if __name__ == "__main__":
    run_self_check()
