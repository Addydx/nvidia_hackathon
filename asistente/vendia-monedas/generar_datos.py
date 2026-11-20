"""Genera los datos del asistente de monedas: entrenamiento, validación y pruebas reservadas (semilla fija).

Cada ejemplo = conteo verificado + pregunta -> respuesta redactada. Importes y respuestas de referencia los calcula el código
(`monedas_lib`), así que son correctos por construcción. Las pruebas reservadas usan combinaciones de conteo que NO aparecen en
entrenamiento ni validación, y parte de sus preguntas fuera de alcance son redacciones que el modelo no ve al entrenar.
"""
import json, random, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import monedas_lib as L

SEED = 42
AQUI = Path(__file__).parent / "datos"

Q_AUTO = ["Explica el conteo.", "¿Qué detectaste en la foto?", "Dime qué encontraste.", "¿Cuánto dinero hay y de qué monedas?",
          "Resume el resultado de la foto.", "¿Qué monedas hay?"]
Q_TOTAL = ["¿Cuál es el total?", "¿Cuánto dinero hay?", "¿Cuántos pesos son en total?", "¿A cuánto suma todo?"]
Q_NMON = ["¿Cuántas monedas hay?", "¿Cuántas monedas detectaste en total?", "¿Cuántas monedas son?"]
Q_CANT = ["¿Cuántas monedas de {d} pesos hay?", "¿Cuántas de {d} encontraste?", "¿Hay monedas de {d} pesos?", "Dime cuántas monedas de {d} hay."]
Q_SUB = ["¿Cuánto suman las monedas de {d} pesos?", "¿Cuánto dinero hay en monedas de {d}?", "¿Cuál es el subtotal de las monedas de {d}?"]
Q_MAS = ["¿De qué denominación hay más monedas?", "¿Cuál es la moneda más abundante?"]
Q_ALCANCE_TRAIN = ["¿Cuál es la capital de Francia?", "¿Qué clima hará mañana?", "Escribe un poema.", "¿Cuánto debo darle de cambio al cliente?",
                   "¿Quién ganó el partido?", "Ayúdame con mi tarea de matemáticas.", "¿Cómo se hace un pastel?", "¿Cuánto vale un dólar hoy?",
                   "¿Cuánto gané hoy en ventas?", "Cuéntame un chiste."]
Q_ALCANCE_TEST = ["¿Cómo se instala Python?", "¿Cuál es la mejor película de 2020?", "Recomiéndame una canción.", "¿Qué hora es en Tokio?",
                  "Dame una receta de tacos."]
Q_LIMITE_TRAIN = ["¿Son monedas falsas?", "¿De qué año son estas monedas?", "¿Faltan monedas?", "¿Hay monedas de 20 pesos?",
                  "¿Seguro que contaste bien?", "¿Quién me pagó con estas monedas?"]
Q_LIMITE_TEST = ["¿Alguna moneda está dañada?", "¿Hay monedas de 50 centavos?"]


def al_azar(rng, pocas=False):
    c = {d: 0 for d in L.DENOMS}
    k = rng.choice([1, 2, 2, 3, 3, 4, 4, 4])
    for d in rng.sample(L.DENOMS, k):
        c[d] = rng.randint(1, 4) if pocas else rng.choice([1, 1, 2, 2, 3, 3, 4, 5, 6, 7, 8, 9, 12, 15, 21, 30])
    return c


def clave(c):
    return tuple(c[d] for d in L.DENOMS)


def ejemplo(c, tipo, rng, banco_alcance, banco_limite, corregido=False):
    d = rng.choice(L.DENOMS)
    if tipo == "auto":
        p, r = rng.choice(Q_AUTO), L.respuesta_auto(c, corregido)
    elif tipo == "total":
        p = rng.choice(Q_TOTAL)
        r = f"El total es de {L.pesos(L.total_pesos(c))}." if L.total_monedas(c) else "No detecté monedas, así que el total es 0 pesos."
    elif tipo == "nmon":
        p = rng.choice(Q_NMON); n = L.total_monedas(c)
        r = f"Hay {n} {'moneda' if n == 1 else 'monedas'} en total." if n else "No detecté ninguna moneda."
    elif tipo == "cant":
        p = rng.choice(Q_CANT).format(d=d); n = c[d]
        r = (f"No encontré monedas de {L.pesos(d)}." if n == 0 else
             f"Encontré {L.palabra(n)} {'moneda' if n == 1 else 'monedas'} de {L.pesos(d)}.")
    elif tipo == "sub":
        p = rng.choice(Q_SUB).format(d=d); n = c[d]
        r = (f"No hay monedas de {L.pesos(d)}, así que ese subtotal es 0 pesos." if n == 0 else
             f"Las monedas de {L.pesos(d)} suman {L.pesos(d * n)}.")
    elif tipo == "mas":
        p = rng.choice(Q_MAS)
        mx = max(c[x] for x in L.DENOMS)
        ganadoras = [x for x in L.DENOMS if c[x] == mx]
        if mx == 0:
            r = "No detecté monedas, así que no hay una denominación con más monedas."
        elif len(ganadoras) == 1:
            r = f"Hay más monedas de {L.pesos(ganadoras[0])}: {L.palabra(mx)}."
        else:
            r = "Hay empate: " + " y ".join(f"de {L.pesos(x)}" for x in ganadoras[:2]) + f", con {L.palabra(mx)} monedas cada denominación." if len(ganadoras) == 2 else \
                f"Hay empate entre varias denominaciones, con {L.palabra(mx)} monedas de cada una."
    elif tipo == "alcance":
        p, r = rng.choice(banco_alcance), L.ALCANCE
    elif tipo == "limite":
        p, r = rng.choice(banco_limite), L.LIMITE
    else:
        raise ValueError(tipo)
    return {"conteo": {str(x): c[x] for x in L.DENOMS}, "corregido": corregido, "pregunta": p, "respuesta": r, "tipo": tipo,
            "total_mxn": L.total_pesos(c)}


PESOS = [("auto", 22), ("total", 9), ("nmon", 8), ("cant", 17), ("sub", 17), ("mas", 4), ("alcance", 8), ("limite", 6), ("auto_corr", 9)]


def construir(rng, n, prohibidos, banco_alcance, banco_limite, pocas=False):
    out, vistos = [], set()
    tipos = [t for t, w in PESOS for _ in range(w)]
    while len(out) < n:
        c = al_azar(rng, pocas)
        if clave(c) in prohibidos or (len(out) < n and clave(c) in vistos and rng.random() < 0.7):
            continue
        t = rng.choice(tipos)
        ej = ejemplo(c, "auto" if t == "auto_corr" else t, rng, banco_alcance, banco_limite, corregido=(t == "auto_corr"))
        out.append(ej); vistos.add(clave(c))
    return out


def main():
    rng = random.Random(SEED)
    AQUI.mkdir(exist_ok=True)
    # --- pruebas reservadas: 12 escenarios fijos + 24 aleatorios con conteos que no entran en entrenamiento
    c30 = {10: 2, 5: 1, 2: 2, 1: 1}
    fijas = [
        ejemplo(c30, "auto", rng, Q_ALCANCE_TEST, Q_LIMITE_TEST) | {"pregunta": "Explica el conteo."},
        ejemplo(c30, "sub", rng, Q_ALCANCE_TEST, Q_LIMITE_TEST) | {"pregunta": "¿Cuánto suman las monedas de 2 pesos?", "respuesta": "Las monedas de 2 pesos suman 4 pesos."},
        ejemplo(c30, "nmon", rng, Q_ALCANCE_TEST, Q_LIMITE_TEST) | {"pregunta": "¿Cuántas monedas hay?"},
        ejemplo(c30, "cant", rng, Q_ALCANCE_TEST, Q_LIMITE_TEST) | {"pregunta": "¿Cuántas monedas de 5 pesos hay?", "respuesta": "Encontré una moneda de 5 pesos."},
        ejemplo({10: 0, 5: 3, 2: 0, 1: 4}, "cant", rng, Q_ALCANCE_TEST, Q_LIMITE_TEST) | {"pregunta": "¿Cuántas monedas de 10 pesos hay?", "respuesta": "No encontré monedas de 10 pesos."},
        ejemplo({10: 1, 5: 2, 2: 3, 1: 2}, "auto", rng, Q_ALCANCE_TEST, Q_LIMITE_TEST, corregido=True),
        ejemplo({10: 0, 5: 0, 2: 0, 1: 0}, "auto", rng, Q_ALCANCE_TEST, Q_LIMITE_TEST),
        ejemplo(c30, "alcance", rng, ["¿Cuál es la capital de Japón?"], Q_LIMITE_TEST),
        ejemplo(c30, "alcance", rng, ["Escríbeme un correo para mi jefe."], Q_LIMITE_TEST),
        ejemplo(c30, "limite", rng, Q_ALCANCE_TEST, ["¿Estas monedas son de colección?"]),
        ejemplo({10: 3, 5: 0, 2: 1, 1: 7}, "sub", rng, Q_ALCANCE_TEST, Q_LIMITE_TEST) | {"pregunta": "¿Cuánto suman las monedas de 10 pesos?", "respuesta": "Las monedas de 10 pesos suman 30 pesos."},
        ejemplo({10: 3, 5: 0, 2: 1, 1: 7}, "total", rng, Q_ALCANCE_TEST, Q_LIMITE_TEST),
    ]
    reservadas = {clave({int(k): v for k, v in e["conteo"].items()}) for e in fijas}
    azar = construir(rng, 24, set(), Q_ALCANCE_TEST, Q_LIMITE_TEST, pocas=True)
    test = fijas + azar
    reservadas = {clave({int(k): v for k, v in e["conteo"].items()}) for e in test}
    train = construir(rng, 640, reservadas, Q_ALCANCE_TRAIN, Q_LIMITE_TRAIN)
    usados = reservadas | {clave({int(k): v for k, v in e["conteo"].items()}) for e in train}
    valid = construir(rng, 96, reservadas, Q_ALCANCE_TRAIN, Q_LIMITE_TRAIN)
    # las pruebas no comparten combinación de conteo con entrenamiento
    en_train = {clave({int(k): v for k, v in e["conteo"].items()}) for e in train}
    assert not (reservadas & en_train), "fuga entre entrenamiento y pruebas"
    for nombre, datos in (("train", train), ("valid", valid), ("test", test)):
        for e in datos:  # mensajes listos para el modelo
            c = {int(k): v for k, v in e["conteo"].items()}
            e["messages"] = L.mensajes(c, e["pregunta"], e["corregido"]) + [{"role": "assistant", "content": e["respuesta"]}]
        with open(AQUI / f"{nombre}.jsonl", "w", encoding="utf-8") as f:
            for e in datos:
                f.write(json.dumps(e, ensure_ascii=False) + "\n")
    # comprobación de calidad: toda respuesta de referencia pasa el verificador
    for e in train + valid + test:
        c = {int(k): v for k, v in e["conteo"].items()}
        ok, mot = L.verificar(e["respuesta"], c, auto=(e["tipo"] == "auto"))
        assert ok, (e, mot)
    resumen = {"semilla": SEED, "train": len(train), "valid": len(valid), "test": len(test),
               "tipos_train": {t: sum(1 for e in train if e["tipo"] == t) for t in {e["tipo"] for e in train}},
               "tipos_test": {t: sum(1 for e in test if e["tipo"] == t) for t in {e["tipo"] for e in test}},
               "combinaciones_unicas_train": len(en_train)}
    (AQUI / "resumen.json").write_text(json.dumps(resumen, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(resumen, ensure_ascii=False))


if __name__ == "__main__":
    main()
