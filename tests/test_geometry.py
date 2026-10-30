"""Pruebas unitarias para el módulo src/geometry.py."""

import math
import unittest

from src.config import (
    Coordinates,
    DEBRIS_ZONES,
    OCCUPIED_POSITIONS,
    R_EARTH,
    TARGET_OBSERVATION_RADIUS_KM,
)
from src.geometry import (
    angular_distance_deg,
    haversine_distance_km,
    is_region_covered,
    violates_exclusion_zone,
)


class TestGeometryFunctions(unittest.TestCase):
    """Pruebas para funciones trigonométricas y cálculos ortodrómicos."""

    def test_identical_points(self) -> None:
        p = Coordinates(latitude=20.5, longitude=-89.0)
        self.assertEqual(angular_distance_deg(p, p), 0.0)
        self.assertEqual(haversine_distance_km(p, p), 0.0)

    def test_known_meridional_distance(self) -> None:
        p1 = Coordinates(latitude=20.5, longitude=-89.0)
        p2 = Coordinates(latitude=21.0, longitude=-89.0)
        self.assertAlmostEqual(angular_distance_deg(p1, p2), 0.5, places=7)
        expected_km = R_EARTH * math.radians(0.5)
        self.assertAlmostEqual(haversine_distance_km(p1, p2), expected_km, places=4)

    def test_region_coverage(self) -> None:
        sat = Coordinates(latitude=20.5, longitude=-89.0)
        target = Coordinates(latitude=21.0, longitude=-89.0)  # ~55.6 km
        self.assertTrue(is_region_covered(sat, target, max_radius_km=300.0))
        self.assertFalse(is_region_covered(sat, target, max_radius_km=50.0))

    def test_exclusion_zone_violation(self) -> None:
        zone = DEBRIS_ZONES[0]  # Atlántico Norte, r=12.0 deg
        inside = Coordinates(latitude=zone.lat, longitude=zone.lon)
        outside = Coordinates(latitude=0.0, longitude=0.0)
        self.assertTrue(violates_exclusion_zone(inside, zone.coordinates, zone.radius_deg))
        self.assertFalse(violates_exclusion_zone(outside, zone.coordinates, zone.radius_deg))

    def test_strict_boundary_condition_exclusion(self) -> None:
        # La condición es estrictamente menor (<)
        center = Coordinates(latitude=0.0, longitude=0.0)
        border = Coordinates(latitude=5.0, longitude=0.0)  # Exactamente a 5.0 deg
        self.assertFalse(violates_exclusion_zone(border, center, exclusion_radius_deg=5.0))

    def test_antipodal_numerical_stability(self) -> None:
        p1 = Coordinates(latitude=0.0, longitude=0.0)
        p2 = Coordinates(latitude=0.0, longitude=180.0)
        self.assertAlmostEqual(angular_distance_deg(p1, p2), 180.0, places=5)
        self.assertAlmostEqual(haversine_distance_km(p1, p2), math.pi * R_EARTH, places=3)


if __name__ == "__main__":
    unittest.main()

