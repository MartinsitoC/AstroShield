# AstroShield — Informe de Batería de Pruebas y Validación Cuantitativa
## Control de Calidad de Software (QA) y Verificación Experimental

**Fecha de Ejecución:** `2026-10-30 17:10:43 UTC`  
**Entorno:** Python 3.13.14 | Modelo de Tierra Esférica ($R = 6371.0$ km)  
**Veredicto Global:** **TODAS LAS PRUEBAS APROBADAS (7 / 7 PASS)**

---

### Resumen Ejecutivo de la Batería

| ID Prueba | Caso de Prueba / Hipótesis Evaluada | Métrica Principal | Resultado | Estado |
| :--- | :--- | :--- | :---: | :---: |
| **TEST-01** | Convergencia y Ganancia Neta | Ganancia neta de fitness | `+10.00 pts` | **PASS** |
| **TEST-02** | Conformidad con DEBRIS_ZONES | Violaciones de escombros | `0 colisiones` | **PASS** |
| **TEST-03** | Separación de Posiciones Ocupadas | Buffer mínimo de seguridad | `+12.03°` | **PASS** |
| **TEST-04** | Reducción del Espacio de Búsqueda | Impacto por zonas de 15° | `-4.00 pts` | **PASS** |
| **TEST-05** | Estrés Hostil (Trampa en Yucatán) | Evasión de zona prohibitiva | `Seguridad Priorizada` | **PASS** |
| **TEST-06** | Robustez Multisemilla (5 Corridas) | Media +/- Desv. Estándar | `7.00 +/- 1.10 pts` | **PASS** |
| **TEST-07** | Resiliencia ante Pérdida de Satélite | Pérdida de cobertura | `-3.00 pts` | **PASS** |

---

### 1. Detalle TEST-01: Convergencia y Ganancia Neta

Demuestra la capacidad de optimización del Algoritmo Genético partiendo de una población inicial aleatoria hasta alcanzar una solución de alta cobertura sin violaciones.

| Métrica | Valor Obtenido | Descripción |
| :--- | :---: | :--- |
| **Fitness Inicial (Gen 0)** | `0.00 pts` | Mejor individuo de la muestra aleatoria |
| **Fitness Final Optimizado** | `10.00 pts` | Desempeño alcanzado tras 100 generaciones |
| **Ganancia Neta (Delta F)** | `+10.00 pts` | Incremento absoluto de aptitud |
| **Primera Generación Válida** | `Gen 0` | Época donde se erradicó la última colisión |
| **Cobertura Terrestre Final** | `10.00 / 13.0 pts (76.9%)` | Suma ponderada de prioridades |
| **Regiones Observadas** | `4 / 6` | Península de Yucatán, México, Amazonía brasileña, California, Estados Unidos, Japón |

---

### 2. Detalle TEST-02: Conformidad con Zonas de Escombros (DEBRIS_ZONES)

Evalúa la separación angular geodésica de cada uno de los 8 satélites contra las 3 zonas de alta densidad de basura espacial.

| Zona de Escombros | Centro (Lat, Lon) | Radio de Exclusión | Infracciones | Margen Mínimo Observado |
| :--- | :---: | :---: | :---: | :---: |
| **Atlántico Norte** | `+45.0°, -35.0°` | `12.0°` | `0` | Seguro |
| **Pacífico Sur** | `-30.0°, -120.0°` | `10.0°` | `0` | Seguro |
| **Región polar norte** | `+78.0°, +30.0°` | `8.0°` | `0` | Seguro |

* **Total de pares (Satélite, Zona) auditados:** `24`
* **Margen angular de seguridad mínimo global:** `+25.17°` respecto al perímetro de exclusión más cercano.

---

### 3. Detalle TEST-03: Cumplimiento de Posiciones Ocupadas Preexistentes

Verifica que la constelación respete la burbuja de seguridad operacional de 5.0° alrededor de los activos preexistentes.

| Objeto Preexistente | Posición Orbital (Lat, Lon) | Radio Exclusión | Separación Mínima Medida | Margen de Guarda |
| :--- | :---: | :---: | :---: | :---: |
| **Objeto A** | `+10.0°, +45.0°` | `5.0°` | `> 5.0°` | Aprobado |
| **Objeto B** | `-15.0°, +110.0°` | `5.0°` | `> 5.0°` | Aprobado |

* **Separación angular mínima absoluta:** `17.03°` (Umbral requerido: `5.0°`).
* **Infracciones registradas:** `0` (`Violations = 0`).

---

### 4. Detalle TEST-04: Sensibilidad ante Reducción del Espacio de Búsqueda

Se introdujeron 2 zonas de exclusión artificiales de 15.0° de radio angular (Pacífico Este y Atlántico Central) para estrechar severamente los corredores orbitales viables.

| Escenario Experimental | Zonas de Exclusión Totales | Fitness Final | Cobertura Ponderada | Infracciones |
| :--- | :---: | :---: | :---: | :---: |
| **Escenario Base Oficial** | `5 zonas` (3 Debris + 2 Objetos) | `10.00 pts` | `76.9%` | `0` |
| **Espacio Orbital Reducido** | `7 zonas` (+2 de 15.0°) | `6.00 pts` | `46.2%` | `0` |
| **Impacto Relativo (Delta)** | `+2 zonas críticas` | `-4.00 pts` | - | `Invariante (Válido)` |

---

### 5. Detalle TEST-05: Condición de Estrés Hostil Inviable (Trampa en Yucatán)

Se situó una zona de escombros de 15.0° concéntrica sobre la **Península de Yucatán** (+20.5°, -89.0°), generando un conflicto directo entre sumar +3.0 pts de cobertura vs recibir -10.0 pts de penalización por invasión.

| Variable de Evaluación | Resultado Observado | Comportamiento Esperado del Algoritmo |
| :--- | :---: | :--- |
| **Invasión a Zona Hostil** | **NO** (`0 colisiones`) | No penetrar la zona prohibida bajo ninguna circunstancia |
| **Cobertura en Yucatán** | **DESCUBIERTA** | Sacrificar la cobertura ante la imposibilidad física |
| **Validez de la Solución** | **TRUE** (`is_valid = True`) | Entregar una configuración 100% legal |
| **Fitness Final Resultante** | `6.00 pts` | Mantener la cobertura en las regiones restantes seguras |

> [!NOTE]
> La función de aptitud demostró matemáticamente que el costo de penalización (-10.0 pts) domina de forma efectiva sobre la recompensa local (+3.0 pts), orientando la selección genética hacia el cumplimiento de la seguridad operativa.

---

### 6. Detalle TEST-06: Variabilidad Estocástica y Robustez Multisemilla

Evaluación de 5 corridas independientes de optimización con semillas pseudoaleatorias dispares.

| Corrida | Semilla (`seed`) | Fitness Obtenido | Cobertura Pts | % Cobertura | Infracciones | Solución Válida |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **#1** | `10` | `7.00` | `7.00` | `53.8%` | `0` | `Válida` |
| **#2** | `42` | `8.00` | `8.00` | `61.5%` | `0` | `Válida` |
| **#3** | `100` | `8.00` | `8.00` | `61.5%` | `0` | `Válida` |
| **#4** | `2026` | `5.00` | `5.00` | `38.5%` | `0` | `Válida` |
| **#5** | `777` | `7.00` | `7.00` | `53.8%` | `0` | `Válida` |

* **Fitness Medio:** `7.00 pts`
* **Desviación Estándar:** `1.10 pts`
* **Rango:** `[5.00, 8.00] pts`
* **Tasa de Soluciones Válidas:** **`100.0%`** (Todas las corridas convergieron a constelaciones libres de colisión).

---

### 7. Detalle TEST-07: Resiliencia ante Falla Catastrófica de Satélite Crítico

Simula la desconexión total del satélite con mayor aporte de cobertura (*Single Point of Failure Analysis*), evaluando la capacidad de cobertura remanente con los 7 satélites supervivientes.

| Parámetro de Resiliencia | Valor Cuantitativo |
| :--- | :---: |
| **Satélite Crítico Identificado** | `SAT-#2` |
| **Regiones Observadas por este Satélite** | Península de Yucatán, México |
| **Aporte Directo del Satélite Crítico** | `3.00 pts` |
| **Cobertura Inicial (8 Satélites)** | `10.00 pts (76.9%)` |
| **Cobertura Degradada (7 Satélites)** | `7.00 pts (53.8%)` |
| **Pérdida Neta de Cobertura** | `-3.00 pts (-23.1%)` |
| **Preservación de Regiones de Prioridad Alta** | `1 / 2 activas` |
| **Seguridad Orbital Remanente** | `Válida (0 violaciones)` |

---

### Conclusión Técnica y Dictamen de Calidad

La batería de 7 pruebas valida formalmente que el motor evolutivo de **AstroShield**:
1. Conduce la búsqueda de forma monótonamente ascendente hacia soluciones viables y de alta cobertura.
2. Satisface el 100% de los requerimientos de seguridad orbital frente a escombros y activos previos.
3. Demuestra estabilidad estocástica reproducible y resistencia ante condiciones hostiles extremas.
