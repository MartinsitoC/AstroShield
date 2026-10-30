"""Módulo de configuración central del proyecto AstroShield.

Define las constantes físicas, parámetros de la constelación satelital,
estructuras de datos para coordenadas y restricciones espaciales/terrestres,
así como los catálogos oficiales de regiones objetivo, zonas de basura espacial
y posiciones orbitales ocupadas.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Final, Tuple


# ==============================================================================
# CONSTANTES FÍSICAS Y PARÁMETROS DE LA CONSTELACIÓN
# ==============================================================================

R_EARTH: Final[float] = 6371.0
"""Radio medio de la Tierra en kilómetros (km)."""

NUM_SATELLITES: Final[int] = 8
"""Número total de satélites en la constelación AstroShield."""

TARGET_OBSERVATION_RADIUS_KM: Final[float] = 300.0
"""Radio base de observación terrestre por satélite en kilómetros (km)."""


# ==============================================================================
# NIVELES DE PRIORIDAD Y FACTORES DE PONDERACIÓN
# ==============================================================================

class PriorityLevel(str, Enum):
    """Niveles de prioridad para las regiones objetivo de observación."""
    ALTA = "Alta"
    MEDIA = "Media"
    NORMAL = "Normal"


PRIORITY_WEIGHTS: Final[dict[str, float]] = {
    PriorityLevel.ALTA.value: 3.0,
    PriorityLevel.MEDIA.value: 2.0,
    PriorityLevel.NORMAL.value: 1.0,
}
"""Factores numéricos de ponderación asociados a cada nivel de prioridad."""


# ==============================================================================
# ESTRUCTURAS DE DATOS BASE
# ==============================================================================

@dataclass(frozen=True)
class Coordinates:
    """Coordenadas geográficas en grados decimales.

    Attributes:
        latitude: Latitud en grados [-90.0, 90.0].
        longitude: Longitud en grados [-180.0, 180.0].
    """
    latitude: float
    longitude: float

    def __post_init__(self) -> None:
        if not (-90.0 <= self.latitude <= 90.0):
            raise ValueError(
                f"Latitud fuera de rango: {self.latitude}. Debe ubicarse en [-90.0, 90.0]."
            )
        if not (-180.0 <= self.longitude <= 180.0):
            raise ValueError(
                f"Longitud fuera de rango: {self.longitude}. Debe ubicarse en [-180.0, 180.0]."
            )

    @property
    def lat(self) -> float:
        """Alias abreviado para la latitud."""
        return self.latitude

    @property
    def lon(self) -> float:
        """Alias abreviado para la longitud."""
        return self.longitude


@dataclass(frozen=True)
class TargetRegion:
    """Región terrestre objetivo de observación con prioridad asignada.

    Attributes:
        name: Nombre descriptivo de la región.
        coordinates: Coordenadas geográficas centrales (latitud, longitud).
        priority: Nivel de prioridad textual ('Alta', 'Media', 'Normal').
        weight: Factor de peso numérico derivado de la prioridad.
    """
    name: str
    coordinates: Coordinates
    priority: str
    weight: float = field(default=0.0)

    def __post_init__(self) -> None:
        # Asignar peso automáticamente según la prioridad si no se especificó o es 0.0
        if self.weight == 0.0 and self.priority in PRIORITY_WEIGHTS:
            object.__setattr__(self, "weight", PRIORITY_WEIGHTS[self.priority])

    @property
    def lat(self) -> float:
        return self.coordinates.latitude

    @property
    def lon(self) -> float:
        return self.coordinates.longitude


@dataclass(frozen=True)
class DebrisZone:
    """Zona de alta densidad de basura espacial (escombros orbitales).

    Attributes:
        name: Identificador o denominación de la zona de escombros.
        coordinates: Coordenadas del punto central de la zona.
        radius_deg: Radio angular de exclusión en grados decimales.
    """
    name: str
    coordinates: Coordinates
    radius_deg: float

    def __post_init__(self) -> None:
        if self.radius_deg < 0.0:
            raise ValueError(
                f"El radio angular no puede ser negativo: {self.radius_deg}"
            )

    @property
    def lat(self) -> float:
        return self.coordinates.latitude

    @property
    def lon(self) -> float:
        return self.coordinates.longitude

    @property
    def radio_deg(self) -> float:
        """Alias en español para el radio angular en grados."""
        return self.radius_deg


@dataclass(frozen=True)
class OccupiedPosition:
    """Posición orbital ocupada por un satélite o estructura preexistente.

    Attributes:
        name: Identificador del objeto preexistente.
        coordinates: Coordenadas de la posición ocupada.
        radius_deg: Radio angular de exclusión de seguridad en grados decimales.
    """
    name: str
    coordinates: Coordinates
    radius_deg: float

    def __post_init__(self) -> None:
        if self.radius_deg < 0.0:
            raise ValueError(
                f"El radio angular de exclusión no puede ser negativo: {self.radius_deg}"
            )

    @property
    def lat(self) -> float:
        return self.coordinates.latitude

    @property
    def lon(self) -> float:
        return self.coordinates.longitude

    @property
    def radio_deg(self) -> float:
        """Alias en español para el radio angular de exclusión."""
        return self.radius_deg


# ==============================================================================
# CATÁLOGOS INMUTABLES DEL PROBLEMA OFICIAL
# ==============================================================================

TARGET_REGIONS: Final[Tuple[TargetRegion, ...]] = (
    TargetRegion(
        name="Península de Yucatán, México",
        coordinates=Coordinates(latitude=20.5, longitude=-89.0),
        priority="Alta",
        weight=3.0,
    ),
    TargetRegion(
        name="Amazonía brasileña",
        coordinates=Coordinates(latitude=-3.5, longitude=-62.0),
        priority="Alta",
        weight=3.0,
    ),
    TargetRegion(
        name="California, Estados Unidos",
        coordinates=Coordinates(latitude=36.8, longitude=-119.4),
        priority="Media",
        weight=2.0,
    ),
    TargetRegion(
        name="Región del Sahel, África",
        coordinates=Coordinates(latitude=15.0, longitude=0.0),
        priority="Media",
        weight=2.0,
    ),
    TargetRegion(
        name="Japón",
        coordinates=Coordinates(latitude=36.0, longitude=138.0),
        priority="Media",
        weight=2.0,
    ),
    TargetRegion(
        name="Interior de Australia",
        coordinates=Coordinates(latitude=-25.0, longitude=133.0),
        priority="Normal",
        weight=1.0,
    ),
)

DEBRIS_ZONES: Final[Tuple[DebrisZone, ...]] = (
    DebrisZone(
        name="Atlántico Norte",
        coordinates=Coordinates(latitude=45.0, longitude=-35.0),
        radius_deg=12.0,
    ),
    DebrisZone(
        name="Pacífico Sur",
        coordinates=Coordinates(latitude=-30.0, longitude=-120.0),
        radius_deg=10.0,
    ),
    DebrisZone(
        name="Región polar norte",
        coordinates=Coordinates(latitude=78.0, longitude=30.0),
        radius_deg=8.0,
    ),
)

OCCUPIED_POSITIONS: Final[Tuple[OccupiedPosition, ...]] = (
    OccupiedPosition(
        name="Objeto A",
        coordinates=Coordinates(latitude=10.0, longitude=45.0),
        radius_deg=5.0,
    ),
    OccupiedPosition(
        name="Objeto B",
        coordinates=Coordinates(latitude=-15.0, longitude=110.0),
        radius_deg=5.0,
    ),
)


# ==============================================================================
# VALIDACIÓN DIRECTA Y RESUMEN DEL SISTEMA
# ==============================================================================

def print_configuration_summary() -> None:
    """Imprime un resumen legible de todas las constantes, regiones y restricciones."""
    separator_double = "=" * 80
    separator_single = "-" * 80

    print(separator_double)
    print("                    ASTROSHIELD - CONFIGURACIÓN DEL SISTEMA                     ")
    print(separator_double)
    print(f" * Radio medio terrestre (R_EARTH)          : {R_EARTH:.1f} km")
    print(f" * Satélites en constelación (NUM_SATELLITES) : {NUM_SATELLITES}")
    print(f" * Radio base de observación terrestre       : {TARGET_OBSERVATION_RADIUS_KM:.1f} km")
    print(f" * Factores de peso por prioridad           : {PRIORITY_WEIGHTS}")
    print(separator_single)

    print(f"\n[1] REGIONES OBJETIVO TERRESTRES ({len(TARGET_REGIONS)} definidas):")
    header_targets = f"  {'#':<3} {'Nombre':<32} {'Latitud':>10} {'Longitud':>11} {'Prioridad':>10} {'Peso':>6}"
    print(header_targets)
    print("  " + "-" * 76)
    for idx, region in enumerate(TARGET_REGIONS, start=1):
        print(
            f"  {idx:<3} {region.name:<32} {region.lat:>9.2f}  {region.lon:>10.2f}  "
            f"{region.priority:>10} {region.weight:>6.1f}"
        )

    print(f"\n[2] ZONAS DE BASURA ESPACIAL (DEBRIS) ({len(DEBRIS_ZONES)} definidas):")
    header_debris = f"  {'#':<3} {'Zona':<28} {'Centro Lat':>12} {'Centro Lon':>13} {'Radio (deg)':>13}"
    print(header_debris)
    print("  " + "-" * 73)
    for idx, zone in enumerate(DEBRIS_ZONES, start=1):
        print(
            f"  {idx:<3} {zone.name:<28} {zone.lat:>11.2f}  {zone.lon:>12.2f}  {zone.radius_deg:>12.1f}"
        )

    print(f"\n[3] POSICIONES OCUPADAS PREEXISTENTES ({len(OCCUPIED_POSITIONS)} definidas):")
    header_occupied = f"  {'#':<3} {'Objeto':<28} {'Posicion Lat':>14} {'Posicion Lon':>15} {'Radio Excl (deg)':>18}"
    print(header_occupied)
    print("  " + "-" * 82)
    for idx, obj in enumerate(OCCUPIED_POSITIONS, start=1):
        print(
            f"  {idx:<3} {obj.name:<28} {obj.lat:>13.2f}  {obj.lon:>14.2f}  {obj.radius_deg:>17.1f}"
        )

    print(separator_double)
    print("  [OK] Verificacion sintactica y estructural completada exitosamente.")
    print(separator_double)


if __name__ == "__main__":
    print_configuration_summary()
