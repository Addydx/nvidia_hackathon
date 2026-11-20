"""Lógica de conteo extraída de vendia.py (sin entrenamiento ni Colab)."""

from typing import Iterable

# Denominaciones que devuelve el servicio, en este orden.
DENOMINACIONES = (1, 2, 5, 10)

# Nombre de clase del modelo (sin espacios, en minúsculas) -> valor.
# Las clases del entrenamiento son peso1, peso2, peso5 y peso10; Roboflow
# a veces las exporta con espacio ("peso 2"), por eso se normaliza.
VALORES = {"peso1": 1, "peso2": 2, "peso5": 5, "peso10": 10}


def normalizar_clase(nombre: str) -> str:
    return nombre.lower().replace(" ", "")


def contar(nombres_clase: Iterable[str]) -> dict[str, int]:
    """Cuenta detecciones por denominación. Ignora clases desconocidas."""
    conteo = {str(d): 0 for d in DENOMINACIONES}
    for nombre in nombres_clase:
        valor = VALORES.get(normalizar_clase(nombre))
        if valor is not None:
            conteo[str(valor)] += 1
    return conteo
