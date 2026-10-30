# AstroShield
### Práctica de clase 1

---

## 1. ¿De qué trata el proyecto?
Básicamente, el problema consiste en que una organización necesita diseñar una constelación satelital para monitorear varias regiones clave de la Tierra. El detalle está en que tenemos un límite estricto de solo 8 satélites y no podemos ponerlos donde queramos: hay zonas prohibidas con basura espacial flotando y puntos que ya están ocupados por otros objetos en órbita.

Para resolver esto, implementamos un algoritmo evolutivo (genético) que va probando, evaluando y optimizando diferentes configuraciones. La meta no es solo acomodar satélites al azar, sino ver qué tan buena resulta la cobertura ponderada, evitar por completo las zonas restringidas y poder visualizar todo el resultado interactivo sobre un globo terráqueo en 3D.

---

## 2. Mapa y estructura del proyecto
El repositorio está organizado de forma modular para que no se mezcle la lógica con las pruebas ni con los gráficos:

```text
AstroShield/
├── docs/                      # Documentación y análisis de resultados
│   ├── 01_problem_definition.md
│   └── 04_results_analysis.md
├── src/                       # Motor del algoritmo y modelos
│   ├── config.py              # Coordenadas, zonas de debris y constantes
│   ├── geometry.py            # Distancias esféricas y fórmula de Haversine
│   ├── evaluator.py           # Cálculo de fitness, prioridades y penalizaciones
│   └── genetic_engine.py      # Operadores genéticos: cruce, mutación y torneo
├── tests/                     # Pruebas y validaciones automáticas
│   ├── test_battery.py        # Suite con las 7 pruebas del proyecto
│   └── test_report.md         # Métricas generadas por las pruebas
├── visualization/             # Visor interactivo en Three.js
│   ├── index.html             # Dashboard y HUD de control
│   ├── app.js                 # Lógica 3D, morfado 2D/3D y órbitas
│   └── data/run_results.json  # Datos reales exportados por el algoritmo
├── main.py                    # Script principal para correr el algoritmo
└── README.md
```

---

## 3. ¿Cómo correr el proyecto? (Paso a paso)

Todo el código de Python corre con la biblioteca estándar (3.10 o superior), así que no necesitas instalar librerías pesadas ni configurar entornos virtuales raros.

### 3.1 Correr el algoritmo genético
Para lanzar la optimización y guardar los resultados para el visor 3D, solo corre:

```powershell
python main.py --pop 100 --gen 150 --seed 42
```

Si quieres jugar con los parámetros, puedes pasarle opciones por consola:
* `--pop`: Tamaño de la población (por defecto `100`).
* `--gen`: Cuántas generaciones evolucionar (por defecto `150`).
* `--crossover`: Tasa de cruce de satélites (por defecto `0.80`, es decir 80%).
* `--mutation`: Probabilidad de que un satélite mute (por defecto `0.15`).
* `--sigma`: Qué tanto se mueve un satélite al mutar (desviación gaussiana en grados, por defecto `4.0`).
* `--seed`: Semilla aleatoria (ponle un número si quieres resultados reproducibles).
* `--output`: Dónde guardar el JSON para el visor (por defecto `visualization/data/run_results.json`).

---

### 3.2 Correr las pruebas automáticas
Para verificar que todo el sistema y las restricciones se cumplan al 100%:

```powershell
# Batería con los 7 experimentos requeridos (genera tests/test_report.md):
python -m tests.test_battery

# Todas las 26 pruebas unitarias del backend:
python -m unittest discover -s tests -t .
```

---

### 3.3 Abrir el visor 3D interactivo
El visualizador está hecho en HTML5 y Three.js:

1. **Opción recomendada (servidor local de Python):**
   ```powershell
   python -m http.server 8000
   ```
   Y abres en tu navegador: [http://localhost:8000/visualization/index.html](http://localhost:8000/visualization/index.html).

2. **Opción directa (doble clic):**  
   Puedes abrir directamente [visualization/index.html](file:///c:/Users/marca/Documents/VScode/Fundamentos%20de%20IA/AstroShield/visualization/index.html). Si el navegador bloquea la lectura automática del JSON por seguridad local (CORS en `file://`), la misma interfaz tiene un botón para seleccionar `run_results.json` y cargarlo al instante.

---

## 4. ¿Cómo resolvimos el problema? (Detalles clave)

* **Cromosomas continuos:** Cada individuo de la población representa una constelación completa de 8 satélites. En lugar de usar bits binarios difíciles de mapear, usamos coordenadas reales $(\text{lat}_i, \text{lon}_i)$, con latitudes en $[-90^\circ, 90^\circ]$ y longitudes en $[-180^\circ, 180^\circ]$.
* **Distancias con Haversine blindado:** Como la Tierra es redonda, no podemos usar distancia euclidiana normal. Usamos la fórmula de Haversine con un *clamping* matemático para evitar que un redondeo de punto flotante rompa el cálculo en los polos o puntos idénticos.
* **Función de aptitud (Fitness):** Las regiones terrestres tienen distintos niveles de importancia (las de prioridad Alta dan 3.0 pts, Media 2.0 pts y Normal 1.0 pt, sumando 13.0 pts máximos). Si un satélite se acerca demasiado a una zona con basura espacial o a un objeto preexistente, se le aplica una penalización brutal de **$-10.0$ puntos por infracción**, obligando al algoritmo a descartar o corregir esas soluciones de inmediato.
* **Visor 3D con Morfado Continuo (*Mesh Unrolling*):** Toda la visualización corre en WebGL con Three.js. Al pulsar `[🗺️ Mapa 2D Plano]` o `[🌐 Globo 3D]`, la malla del planeta se desenrolla o enrolla continuamente en tiempo real, los conos de cobertura apuntan fielmente al nadir terrestre, y las trayectorias orbitales LEO se iluminan dinámicamente según el satélite que selecciones en el panel de control.

---

## 5. Distribución del equipo (5 integrantes)
Nos repartimos los módulos para que cada integrante conozca a fondo una parte del sistema durante la revisión:

| Integrante | Área asignada | Archivos clave |
| :--- | :--- | :--- |
| **Jesús Martín Canul May** | Arquitectura general, modelado de dominio y coordenadas | `src/config.py`, `src/geometry.py`, `main.py` |
| **Jesús Francisco Sastre Roblero** | Función de aptitud (fitness), prioridades y penalizaciones de exclusión | `src/evaluator.py`, `docs/01_problem_definition.md` |
| **Pedro Luis Izquierdo Morales** | Motor evolutivo, selección por torneo, cruce y mutación esférica | `src/genetic_engine.py` |
| **Hugo Andrey Lechuga Cardoso** | Batería de pruebas de calidad y análisis empírico de resultados | `tests/test_battery.py`, `docs/04_results_analysis.md` |
| **Juan Ramón Gómez Carreón** | Interfaz WebGL, visualización 3D interactiva, órbitas y controles HUD | `visualization/index.html`, `visualization/app.js` |

---

## 6. Uso de herramientas de Inteligencia Artificial

Siguiendo las pautas de honestidad académica del proyecto:

* **¿Qué herramienta usamos?** Utilizamos el asistente de IA **Antigravity** dentro de **Visual Studio Code**.
* **¿En qué nos ayudó?** Nos sirvió para acelerar la creación de la estructura inicial de carpetas, generar esqueletos de código con `dataclasses` tipadas, maquetar la plantilla base de Three.js y redactar tablas de pruebas.
* **¿Qué revisamos nosotros?** Todo el código y las fórmulas fueron auditados a mano:
  1. Revisamos las matemáticas de Haversine paso a paso para asegurarnos de que la distancia angular en la esfera estuviera bien calculada.
  2. Ajustamos la penalización severa de $-10.0$ puntos tras probar que penalizaciones más suaves permitían que satélites invadieran zonas de escombros.
  3. Verificamos que el visor 3D lea realmente el archivo `run_results.json` con los datos calculados por el algoritmo, sin valores simulados fijos.
