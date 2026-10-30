"""Pruebas unitarias para validar las estructuras de datos y catálogos de src/config.py."""

import unittest
from dataclasses import FrozenInstanceError

from src.config import (
    Coordinates,
    DebrisZone,
    OccupiedPosition,
    PriorityLevel,
    TargetRegion,
    NUM_SATELLITES,
    PRIORITY_WEIGHTS,
    R_EARTH,
    TARGET_OBSERVATION_RADIUS_KM,
    DEBRIS_ZONES,
    OCCUPIED_POSITIONS,
    TARGET_REGIONS,
)


class TestConfigConstants(unittest.TestCase):
    """Verificación de constantes globales del sistema."""

    def test_constants_values(self) -> None:
        self.assertEqual(R_EARTH, 6371.0)
        self.assertEqual(NUM_SATELLITES, 8)
        self.assertEqual(TARGET_OBSERVATION_RADIUS_KM, 300.0)

    def test_priority_weights_mapping(self) -> None:
        self.assertEqual(PRIORITY_WEIGHTS["Alta"], 3.0)
        self.assertEqual(PRIORITY_WEIGHTS["Media"], 2.0)
        self.assertEqual(PRIORITY_WEIGHTS["Normal"], 1.0)


class TestDataStructuresValidation(unittest.TestCase):
    """Verificación de las validaciones de las dataclasses."""

    def test_valid_coordinates(self) -> None:
        coord = Coordinates(latitude=20.5, longitude=-89.0)
        self.assertEqual(coord.latitude, 20.5)
        self.assertEqual(coord.longitude, -89.0)
        self.assertEqual(coord.lat, 20.5)
        self.assertEqual(coord.lon, -89.0)

    def test_invalid_coordinates(self) -> None:
        with self.assertRaises(ValueError):
            Coordinates(latitude=95.0, longitude=0.0)
        with self.assertRaises(ValueError):
            Coordinates(latitude=-91.0, longitude=0.0)
        with self.assertRaises(ValueError):
            Coordinates(latitude=0.0, longitude=185.0)
        with self.assertRaises(ValueError):
            Coordinates(latitude=0.0, longitude=-185.0)

    def test_immutability(self) -> None:
        coord = Coordinates(latitude=10.0, longitude=20.0)
        with self.assertRaises(FrozenInstanceError):
            coord.latitude = 15.0  # type: ignore

        region = TARGET_REGIONS[0]
        with self.assertRaises(FrozenInstanceError):
            region.name = "Nuevo Nombre"  # type: ignore


class TestCatalogsIntegrity(unittest.TestCase):
    """Verificación de los catálogos oficiales del problema."""

    def test_target_regions_count_and_weights(self) -> None:
        self.assertEqual(len(TARGET_REGIONS), 6)
        expected_regions = {
            "Península de Yucatán, México": (20.5, -89.0, "Alta", 3.0),
            "Amazonía brasileña": (-3.5, -62.0, "Alta", 3.0),
            "California, Estados Unidos": (36.8, -119.4, "Media", 2.0),
            "Región del Sahel, África": (15.0, 0.0, "Media", 2.0),
            "Japón": (36.0, 138.0, "Media", 2.0),
            "Interior de Australia": (-25.0, 133.0, "Normal", 1.0),
        }
        for region in TARGET_REGIONS:
            self.assertIn(region.name, expected_regions)
            exp_lat, exp_lon, exp_prio, exp_weight = expected_regions[region.name]
            self.assertAlmostEqual(region.lat, exp_lat)
            self.assertAlmostEqual(region.lon, exp_lon)
            self.assertEqual(region.priority, exp_prio)
            self.assertEqual(region.weight, exp_weight)

    def test_debris_zones_count_and_radii(self) -> None:
        self.assertEqual(len(DEBRIS_ZONES), 3)
        expected_zones = {
            "Atlántico Norte": (45.0, -35.0, 12.0),
            "Pacífico Sur": (-30.0, -120.0, 10.0),
            "Región polar norte": (78.0, 30.0, 8.0),
        }
        for zone in DEBRIS_ZONES:
            self.assertIn(zone.name, expected_zones)
            exp_lat, exp_lon, exp_rad = expected_zones[zone.name]
            self.assertAlmostEqual(zone.lat, exp_lat)
            self.assertAlmostEqual(zone.lon, exp_lon)
            self.assertAlmostEqual(zone.radius_deg, exp_rad)
            self.assertAlmostEqual(zone.radio_deg, exp_rad)

    def test_occupied_positions_count_and_radii(self) -> None:
        self.assertEqual(len(OCCUPIED_POSITIONS), 2)
        expected_occupied = {
            "Objeto A": (10.0, 45.0, 5.0),
            "Objeto B": (-15.0, 110.0, 5.0),
        }
        for obj in OCCUPIED_POSITIONS:
            self.assertIn(obj.name, expected_occupied)
            exp_lat, exp_lon, exp_rad = expected_occupied[obj.name]
            self.assertAlmostEqual(obj.lat, exp_lat)
            self.assertAlmostEqual(obj.lon, exp_lon)
            self.assertAlmostEqual(obj.radius_deg, exp_rad)
            self.assertAlmostEqual(obj.radio_deg, exp_rad)


if __name__ == "__main__":
    unittest.main()

