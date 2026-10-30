"""Orquestador principal del proyecto AstroShield.

Ejecuta el Algoritmo Genético para optimizar la constelación de 8 satélites,
evalúa métricas de cobertura y seguridad orbital, y exporta el historial
y estado final en formato JSON para visualización 3D en Three.js.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

# Garantizar que la raíz del proyecto esté en sys.path
PROJECT_ROOT = Path(__file__).resolve().parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config import (
    Coordinates,
    DEBRIS_ZONES,
    OCCUPIED_POSITIONS,
    TARGET_REGIONS,
)
from src.evaluator import EvaluationResult, evaluate_constellation
from src.genetic_engine import (
    AstroShieldGA,
    EvolutionHistory,
    GeneticConfig,
    Individual,
)


# ==============================================================================
# SERIALIZACIÓN A JSON PARA VISUALIZADOR 3D
# ==============================================================================

def export_run_to_json(
    history: EvolutionHistory,
    output_path: str,
    config: Optional[GeneticConfig] = None,
) -> Path:
    """Serializa los resultados de la optimización a un archivo JSON formateado.

    Estructura la información para consumo directo por la interfaz 3D en Three.js:
    metadatos, entorno geodésico/orbital, estado inicial y optimizado, y trayectoria
    de convergencia generacional.

    Args:
        history: Historial completo generado por AstroShieldGA.
        output_path: Ruta del archivo JSON de destino.
        config: Configuración de parámetros empleada (opcional).

    Returns:
        Ruta resuelta de Path del archivo exportado.
    """
    out_file = Path(output_path)
    if not out_file.is_absolute():
        out_file = PROJECT_ROOT / out_file

    out_file.parent.mkdir(parents=True, exist_ok=True)

    init_ind: Individual = history.initial_best
    final_ind: Individual = history.final_best

    init_eval: EvaluationResult = (
        init_ind.evaluation
        if init_ind.evaluation is not None
        else evaluate_constellation(init_ind.satellites)
    )
    final_eval: EvaluationResult = (
        final_ind.evaluation
        if final_ind.evaluation is not None
        else evaluate_constellation(final_ind.satellites)
    )

    # 1. Metadatos de la corrida
    metadata_params = {
        "population_size": config.population_size if config else 100,
        "generations": config.generations if config else len(history.generation_records) - 1,
        "crossover_rate": config.crossover_rate if config else 0.8,
        "mutation_rate": config.mutation_rate if config else 0.15,
        "mutation_sigma_deg": config.mutation_sigma_deg if config else 4.0,
    }

    metadata = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "seed_used": config.seed if config else None,
        "parameters": metadata_params,
    }

    # 2. Catálogo del entorno geográfico y de restricciones
    environment = {
        "target_regions": [
            {
                "name": region.name,
                "lat": region.lat,
                "lon": region.lon,
                "priority": region.priority,
                "weight": region.weight,
            }
            for region in TARGET_REGIONS
        ],
        "debris_zones": [
            {
                "name": zone.name,
                "lat": zone.lat,
                "lon": zone.lon,
                "radius_deg": zone.radius_deg,
            }
            for zone in DEBRIS_ZONES
        ],
        "occupied_positions": [
            {
                "name": obj.name,
                "lat": obj.lat,
                "lon": obj.lon,
                "radius_deg": obj.radius_deg,
            }
            for obj in OCCUPIED_POSITIONS
        ],
    }

    # 3. Estado de la constelación inicial (Gen 0)
    initial_state = {
        "generation": 0,
        "fitness": round(init_eval.fitness, 4),
        "coverage_score": round(init_eval.coverage_score, 4),
        "coverage_percentage": round(init_eval.coverage_percentage, 2),
        "covered_regions": init_eval.covered_regions,
        "uncovered_regions": init_eval.uncovered_regions,
        "violations_count": init_eval.violations_count,
        "violations_details": init_eval.violations_details,
        "is_valid": init_eval.is_valid,
        "satellites": [
            {
                "id": idx,
                "lat": round(sat.latitude, 4),
                "lon": round(sat.longitude, 4),
            }
            for idx, sat in enumerate(init_ind.satellites, start=1)
        ],
    }

    # 4. Estado de la constelación final optimizada
    final_gen_idx = (
        history.generation_records[-1]["gen_number"]
        if history.generation_records
        else metadata_params["generations"]
    )
    final_state = {
        "generation": final_gen_idx,
        "fitness": round(final_eval.fitness, 4),
        "coverage_score": round(final_eval.coverage_score, 4),
        "coverage_percentage": round(final_eval.coverage_percentage, 2),
        "covered_regions": final_eval.covered_regions,
        "uncovered_regions": final_eval.uncovered_regions,
        "violations_count": final_eval.violations_count,
        "violations_details": final_eval.violations_details,
        "is_valid": final_eval.is_valid,
        "satellites": [
            {
                "id": idx,
                "lat": round(sat.latitude, 4),
                "lon": round(sat.longitude, 4),
            }
            for idx, sat in enumerate(final_ind.satellites, start=1)
        ],
    }

    # 5. Trayectoria de convergencia generacional
    convergence_history = [
        {
            "gen": rec["gen_number"],
            "best_fitness": round(rec["best_fitness"], 4),
            "avg_fitness": round(rec["avg_fitness"], 4),
            "coverage_score": round(rec["coverage_score"], 2),
            "violations": rec["violations_count"],
            "is_valid": rec["is_valid"],
        }
        for rec in history.generation_records
    ]

    payload: Dict[str, Any] = {
        "metadata": metadata,
        "environment": environment,
        "initial_state": initial_state,
        "final_state": final_state,
        "convergence_history": convergence_history,
    }

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    return out_file


# ==============================================================================
# PROCESAMIENTO DE ARGUMENTOS CLI Y ORQUESTACIÓN
# ==============================================================================

def parse_cli_args() -> argparse.Namespace:
    """Configura y analiza los argumentos de línea de comandos."""
    parser = argparse.ArgumentParser(
        description="AstroShield: Optimizador Evolutivo de Constelaciones Satelitales LEO."
    )
    parser.add_argument(
        "--pop",
        type=int,
        default=100,
        help="Tamaño de la población (default: 100).",
    )
    parser.add_argument(
        "--gen",
        type=int,
        default=150,
        help="Número máximo de generaciones (default: 150).",
    )
    parser.add_argument(
        "--crossover",
        type=float,
        default=0.8,
        help="Tasa de cruce entre progenitores (default: 0.8).",
    )
    parser.add_argument(
        "--mutation",
        type=float,
        default=0.15,
        help="Tasa de mutación independiente por satélite (default: 0.15).",
    )
    parser.add_argument(
        "--sigma",
        type=float,
        default=4.0,
        help="Desviación estándar de mutación gaussiana en grados (default: 4.0).",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help="Semilla para reproducibilidad estocástica (default: None).",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="visualization/data/run_results.json",
        help="Ruta del archivo de exportación JSON (default: 'visualization/data/run_results.json').",
    )
    return parser.parse_args()


def main() -> None:
    """Función principal de orquestación y ejecución."""
    args = parse_cli_args()

    # Asegurar que el directorio de destino exista
    target_output = Path(args.output)
    if not target_output.is_absolute():
        target_output = PROJECT_ROOT / target_output
    target_output.parent.mkdir(parents=True, exist_ok=True)

    config = GeneticConfig(
        population_size=args.pop,
        generations=args.gen,
        crossover_rate=args.crossover,
        mutation_rate=args.mutation,
        mutation_sigma_deg=args.sigma,
        seed=args.seed,
    )

    print("=" * 82)
    print("           ASTROSHIELD - OPTIMIZACION EVOLUTIVA DE CONSTELACIONES           ")
    print("=" * 82)
    print(f" Configuración: Población={config.population_size} | Generaciones={config.generations}")
    print(f" Probabilidades: Cruce={config.crossover_rate:.2f} | Mutación={config.mutation_rate:.2f} (sigma={config.mutation_sigma_deg:.1f}°)")
    print(f" Semilla aleatoria: {config.seed if config.seed is not None else 'No asignada (aleatoria)'}")
    print(f" Archivo de salida: {target_output}")
    print("=" * 82 + "\n")

    # Inicializar y ejecutar el motor genético
    ga = AstroShieldGA(config=config)
    log_interval = max(1, args.gen // 6)
    history: EvolutionHistory = ga.run(log_interval=log_interval, verbose=True)

    # Exportar resultados a JSON
    exported_file = export_run_to_json(history=history, output_path=args.output, config=config)
    file_size_bytes = os.path.getsize(exported_file)
    file_size_kb = file_size_bytes / 1024.0

    print("\n" + "=" * 82)
    print("                        EXPORTACION EXITOSA                         ")
    print("=" * 82)
    print(f" [OK] Datos serializados para el visor 3D:")
    print(f"      * Archivo : {exported_file}")
    print(f"      * Tamaño  : {file_size_kb:.2f} KB ({file_size_bytes} bytes)")
    print(f"      * Estados : Gen Inicial 0 -> Gen Final {history.generation_records[-1]['gen_number']}")
    print(f"      * Fitness : {history.initial_best.fitness:.2f} pts -> {history.final_best.fitness:.2f} pts")
    print("=" * 82)


if __name__ == "__main__":
    main()

