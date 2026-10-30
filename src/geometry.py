"""Módulo de geometría esférica para el proyecto AstroShield.

Proporciona funciones especializadas para el cálculo de distancias angulares y
ortodrómicas sobre el modelo esférico terrestre, determinación de cobertura
satelital y detección de invasión de zonas de exclusión orbital.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

# Soporte dual: ejecución directa como script o como submódulo de paquete
try:
    from src.config import (
        Coordinates,
        DEBRIS_ZONES,
        OCCUPIED_POSITIONS,
        R_EARTH,
        TARGET_OBSERVATION_RADIUS_KM,
        TARGET_REGIONS,
    )
except (ImportError, ModuleNotFoundError):
    # Agregar la raíz del proyecto AstroShield al sys.path
    project_root = str(Path(__file__).resolve().parent.parent)
    if project_root not in sys.path:
        sys.path.insert(0, project_root)
    from src.config import (
        Coordinates,
        DEBRIS_ZONES,
        OCCUPIED_POSITIONS,
        R_EARTH,
        TARGET_OBSERVATION_RADIUS_KM,
        TARGET_REGIONS,
    )


# ==============================================================================
# FUNCIONES DE CÁLCULO GEOMÉTRICO
# ==============================================================================

def angular_distance_deg(coord1: Coordinates, coord2: Coordinates) -> float:
    """Calcula el ángulo central (distancia angular) en grados sexagesimales entre dos coordenadas.

    Utiliza la formulación de Haversine con estabilización numérica estricta mediante
    acotamiento del término semiverseno en el intervalo [0.0, 1.0]. Esto previene
    indeterminaciones (NaN) y errores de dominio matemático en funciones trigonométricas
    inversas causados por imprecisiones en aritmética de punto flotante IEEE 754, tanto
    para puntos idénticos como para coordenadas antípodas.

    Args:
        coord1: Coordenadas del primer punto geográfico (latitud, longitud).
        coord2: Coordenadas del segundo punto geográfico (latitud, longitud).

    Returns:
        Ángulo central subtendido en grados sexagesimales en el rango [0.0, 180.0].
    """
    # Optimización inmediata para puntos idénticos
    if coord1.latitude == coord2.latitude and coord1.longitude == coord2.longitude:
        return 0.0

    phi1: float = math.radians(coord1.latitude)
    phi2: float = math.radians(coord2.latitude)
    dphi: float = math.radians(coord2.latitude - coord1.latitude)
    dlambda: float = math.radians(coord2.longitude - coord1.longitude)

    # Fórmula del semiverseno (Haversine)
    sin_half_dphi: float = math.sin(dphi / 2.0)
    sin_half_dlambda: float = math.sin(dlambda / 2.0)

    a: float = (sin_half_dphi * sin_half_dphi) + (
        math.cos(phi1) * math.cos(phi2) * (sin_half_dlambda * sin_half_dlambda)
    )

    # Clamping defensivo en [0.0, 1.0] contra desbordamiento por redondeo
    a_clamped: float = min(1.0, max(0.0, a))
    delta_sigma_rad: float = 2.0 * math.asin(math.sqrt(a_clamped))

    return math.degrees(delta_sigma_rad)


def haversine_distance_km(
    coord1: Coordinates,
    coord2: Coordinates,
    r_earth: float = R_EARTH,
) -> float:
    """Calcula la distancia ortodrómica sobre la superficie terrestre en kilómetros.

    Convierte el ángulo central subtendido entre dos puntos a distancia de arco
    geodésico esférico (d = radio * ángulo_en_radianes).

    Args:
        coord1: Coordenadas del punto inicial.
        coord2: Coordenadas del punto final.
        r_earth: Radio de la esfera terrestre en kilómetros (por defecto R_EARTH = 6371.0 km).

    Returns:
        Distancia en kilómetros sobre la superficie de la esfera.
    """
    angle_deg: float = angular_distance_deg(coord1, coord2)
    angle_rad: float = math.radians(angle_deg)
    return r_earth * angle_rad


def is_region_covered(
    sat_pos: Coordinates,
    region_pos: Coordinates,
    max_radius_km: float = TARGET_OBSERVATION_RADIUS_KM,
) -> bool:
    """Determina si una región terrestre queda dentro de la huella de observación de un satélite.

    Evalúa si la distancia ortodrómica entre el punto subsatelital y el centro
    de la región objetivo es menor o igual al radio de cobertura configurado.

    Args:
        sat_pos: Posición subsatelital en coordenadas geográficas.
        region_pos: Coordenadas del centro de la región objetivo.
        max_radius_km: Radio máximo de cobertura terrestre en km
            (por defecto TARGET_OBSERVATION_RADIUS_KM = 300.0 km).

    Returns:
        True si la distancia ortodrómica es menor o igual a max_radius_km; False en caso contrario.
    """
    distance_km: float = haversine_distance_km(sat_pos, region_pos)
    return distance_km <= max_radius_km


def violates_exclusion_zone(
    sat_pos: Coordinates,
    zone_center: Coordinates,
    exclusion_radius_deg: float,
) -> bool:
    """Evalúa si la posición de un satélite invade una zona de exclusión angular.

    Verifica si la separación angular central entre el satélite y el centro
    de la zona restringida es estrictamente menor al radio de exclusión.

    Args:
        sat_pos: Coordenadas de posición del satélite.
        zone_center: Coordenadas del centro de la zona de exclusión (escombros u objeto preexistente).
        exclusion_radius_deg: Radio angular de exclusión en grados sexagesimales.

    Returns:
        True si la separación angular es estrictamente menor al radio de exclusión (<),
        False en caso contrario.
    """
    separation_deg: float = angular_distance_deg(sat_pos, zone_center)
    return separation_deg < exclusion_radius_deg


# ==============================================================================
# SUITE DE PRUEBAS AUTOMÁTICAS Y VERIFICACIÓN DIRECTA
# ==============================================================================

def run_verification_tests() -> None:
    """Ejecuta una batería de pruebas de verificación numérica y funcional."""
    separator_double = "=" * 80
    separator_single = "-" * 80

    print(separator_double)
    print("             ASTROSHIELD - VERIFICACIÓN DEL MÓDULO GEOMETRY             ")
    print(separator_double)

    # --------------------------------------------------------------------------
    # PRUEBA 1: Distancia entre dos puntos idénticos
    # --------------------------------------------------------------------------
    p1 = Coordinates(latitude=20.5, longitude=-89.0)
    p2 = Coordinates(latitude=20.5, longitude=-89.0)

    ang_p1_p2 = angular_distance_deg(p1, p2)
    dist_p1_p2 = haversine_distance_km(p1, p2)

    assert ang_p1_p2 == 0.0, f"Fallo en ángulo idéntico: {ang_p1_p2} != 0.0"
    assert dist_p1_p2 == 0.0, f"Fallo en distancia idéntica: {dist_p1_p2} != 0.0"
    assert not math.isnan(ang_p1_p2), "El ángulo arrojó NaN"
    assert not math.isnan(dist_p1_p2), "La distancia arrojó NaN"

    print(
        f"[PASS] Prueba de distancia ortodrómica (Puntos idénticos):\n"
        f"       Separación angular = {ang_p1_p2:.4f} deg | Distancia de arco = {dist_p1_p2:.4f} km"
    )
    print(separator_single)

    # --------------------------------------------------------------------------
    # PRUEBA 2: Distancia conocida Yucatán (20.5, -89.0) vs punto a 0.5°
    # --------------------------------------------------------------------------
    # Punto a 0.5° al norte sobre el mismo meridiano (latitud 21.0, longitud -89.0)
    yucatan = Coordinates(latitude=20.5, longitude=-89.0)
    yucatan_offset = Coordinates(latitude=21.0, longitude=-89.0)

    ang_known = angular_distance_deg(yucatan, yucatan_offset)
    dist_known = haversine_distance_km(yucatan, yucatan_offset)
    expected_dist = R_EARTH * math.radians(0.5)  # ~55.5976 km

    assert math.isclose(ang_known, 0.5, abs_tol=1e-7), f"Ángulo esperado 0.5 deg, obtenido {ang_known}"
    assert math.isclose(dist_known, expected_dist, rel_tol=1e-6), (
        f"Distancia esperada {expected_dist} km, obtenida {dist_known}"
    )

    # Cobertura con radio base (300 km): debe cubrir el punto a 55.6 km
    covered_300 = is_region_covered(yucatan, yucatan_offset, max_radius_km=300.0)
    # Cobertura con radio estrecho (50 km): NO debe cubrir el punto a 55.6 km
    covered_50 = is_region_covered(yucatan, yucatan_offset, max_radius_km=50.0)

    assert covered_300 is True, "Fallo: punto a 55.6 km debe estar cubierto con radio 300 km"
    assert covered_50 is False, "Fallo: punto a 55.6 km no debe estar cubierto con radio 50 km"

    print(
        f"[PASS] Prueba de distancia conocida (Yucatan vs Yucatan+0.5 deg):\n"
        f"       Separación angular = {ang_known:.4f} deg (esperado: 0.5000 deg)\n"
        f"       Distancia de arco  = {dist_known:.4f} km (esperado teórico: {expected_dist:.4f} km)\n"
        f"       Cobertura con radio 300 km: {covered_300} | Cobertura con radio 50 km: {covered_50}"
    )
    print(separator_single)

    # --------------------------------------------------------------------------
    # PRUEBA 3: Validación de exclusión con DEBRIS_ZONES y OCCUPIED_POSITIONS
    # --------------------------------------------------------------------------
    print("[PASS] Validación de zonas de exclusión (catálogo oficial):")

    # A) DEBRIS_ZONES
    for zone in DEBRIS_ZONES:
        # Satélite justo en el centro de la zona de escombros (violación crítica)
        pos_critical = Coordinates(latitude=zone.lat, longitude=zone.lon)
        # Satélite desplazado a la mitad del radio de exclusión (violación interna)
        pos_internal = Coordinates(
            latitude=min(89.9, zone.lat + (zone.radius_deg * 0.5)),
            longitude=zone.lon,
        )
        # Satélite claramente seguro fuera de la zona (+ 5.0 deg del radio)
        pos_safe = Coordinates(
            latitude=max(-89.9, min(89.9, zone.lat + zone.radius_deg + 5.0)),
            longitude=(zone.lon + 180.0) % 360.0 - 180.0,  # Antimeridiano relativo
        )

        v_crit = violates_exclusion_zone(pos_critical, zone.coordinates, zone.radius_deg)
        v_int = violates_exclusion_zone(pos_internal, zone.coordinates, zone.radius_deg)
        v_safe = violates_exclusion_zone(pos_safe, zone.coordinates, zone.radius_deg)

        assert v_crit is True, f"Fallo: posición central de {zone.name} debe violar la zona"
        assert v_int is True, f"Fallo: posición interna de {zone.name} debe violar la zona"
        assert v_safe is False, f"Fallo: posición alejada de {zone.name} no debe violar la zona"

        print(
            f"       * DEBRIS '{zone.name}' (r={zone.radius_deg:.1f} deg): "
            f"Centro={v_crit} | Interior={v_int} | Seguro={v_safe}"
        )

    # B) OCCUPIED_POSITIONS
    for obj in OCCUPIED_POSITIONS:
        # Satélite en posición colisionante con objeto preexistente
        pos_collide = Coordinates(latitude=obj.lat, longitude=obj.lon)
        # Satélite en el borde exterior seguro (+ radio + 2.0 deg)
        pos_safe = Coordinates(
            latitude=min(89.9, obj.lat + obj.radius_deg + 2.0),
            longitude=obj.lon,
        )

        v_collide = violates_exclusion_zone(pos_collide, obj.coordinates, obj.radius_deg)
        v_safe = violates_exclusion_zone(pos_safe, obj.coordinates, obj.radius_deg)

        assert v_collide is True, f"Fallo: colisión con {obj.name} no detectada"
        assert v_safe is False, f"Fallo: falso positivo en exclusión para {obj.name}"

        print(
            f"       * OBJETO '{obj.name}' (r={obj.radius_deg:.1f} deg): "
            f"Colisión={v_collide} | Seguro={v_safe}"
        )

    print(separator_single)

    # --------------------------------------------------------------------------
    # PRUEBA 4: Estabilidad numérica en puntos antípodas y cuadrantes extremos
    # --------------------------------------------------------------------------
    antipode_a = Coordinates(latitude=45.0, longitude=10.0)
    antipode_b = Coordinates(latitude=-45.0, longitude=-170.0)  # Antípoda exacta

    ang_antipode = angular_distance_deg(antipode_a, antipode_b)
    dist_antipode = haversine_distance_km(antipode_a, antipode_b)
    expected_antipode_km = math.pi * R_EARTH

    assert not math.isnan(ang_antipode), "Antípodas generaron NaN en ángulo"
    assert not math.isnan(dist_antipode), "Antípodas generaron NaN en distancia"
    assert math.isclose(ang_antipode, 180.0, abs_tol=1e-5), (
        f"Ángulo antípoda esperado 180.0 deg, obtenido {ang_antipode}"
    )
    assert math.isclose(dist_antipode, expected_antipode_km, rel_tol=1e-5), (
        f"Distancia antípoda esperada {expected_antipode_km} km, obtenida {dist_antipode}"
    )

    print(
        f"[PASS] Prueba de estabilidad numérica y antípodas:\n"
        f"       Separación angular = {ang_antipode:.4f} deg (máximo 180.0000 deg)\n"
        f"       Distancia de arco  = {dist_antipode:.4f} km (sin NaN, dominio acotado)"
    )

    print(separator_double)
    print("  [OK] Todas las pruebas del módulo de geometría finalizaron con éxito.")
    print(separator_double)


if __name__ == "__main__":
    run_verification_tests()

