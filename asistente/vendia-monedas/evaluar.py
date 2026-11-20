"""Compara el modelo base y el ajustado (LoRA) con las pruebas reservadas, con generación determinista.

Métricas por modelo: respuestas VERIFICADAS (cada cifra y cada afirmación coinciden con los hechos), coincidencia exacta con la
referencia y manejo correcto de preguntas fuera de alcance. Guarda `comparacion.json` y `metricas.json`.
"""
import json, os, sys
from pathlib import Path
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel
sys.path.insert(0, str(Path(__file__).parent))
import monedas_lib as L

AQUI = Path(__file__).parent
BASE = os.environ.get("VENDIA_BASE", "Qwen/Qwen2.5-1.5B-Instruct")
SALIDA = Path(os.environ.get("VENDIA_SALIDA", AQUI))


def generar(model, tok, msgs, max_new=110):
    ids = tok.apply_chat_template(msgs, add_generation_prompt=True, return_tensors="pt").to("cuda")
    with torch.inference_mode():
        out = model.generate(ids, attention_mask=torch.ones_like(ids), max_new_tokens=max_new, do_sample=False, pad_token_id=tok.eos_token_id)
    return tok.decode(out[0, ids.shape[1]:], skip_special_tokens=True).strip()


def puntuar(resp, ej):
    c = {int(k): v for k, v in ej["conteo"].items()}
    ok, motivos = L.verificar(resp, c, auto=(ej["tipo"] == "auto"))
    alcance_esperado = ej["tipo"] in ("alcance", "limite")
    marca = resp.startswith("Solo puedo explicar") or resp.startswith("No puedo saberlo")
    return {"verificada": bool(ok and (marca if alcance_esperado else not marca)), "exacta": resp.strip() == ej["respuesta"].strip(),
            "motivos": motivos if not ok else ([] if (marca == alcance_esperado) else ["alcance incorrecto"])}


def main():
    tok = AutoTokenizer.from_pretrained(BASE)
    base = AutoModelForCausalLM.from_pretrained(BASE, torch_dtype=torch.float16, device_map={"": 0})
    model = PeftModel.from_pretrained(base, SALIDA / "vendia-monedas-lora").eval()
    pruebas = [json.loads(l) for l in open(AQUI / "datos" / "test.jsonl", encoding="utf-8")]
    filas, res = [], {"base": [], "ajustado": []}
    for ej in pruebas:
        c = {int(k): v for k, v in ej["conteo"].items()}
        msgs = L.mensajes(c, ej["pregunta"], ej["corregido"])
        with model.disable_adapter():
            rb = generar(model, tok, msgs)
        ra = generar(model, tok, msgs)
        pb, pa = puntuar(rb, ej), puntuar(ra, ej)
        res["base"].append(pb); res["ajustado"].append(pa)
        filas.append({"tipo": ej["tipo"], "conteo": ej["conteo"], "pregunta": ej["pregunta"], "referencia": ej["respuesta"],
                      "base": rb, "base_eval": pb, "ajustado": ra, "ajustado_eval": pa})
        print(ej["tipo"], "|", ej["pregunta"], "|| base:", pb["verificada"], "| ajustado:", pa["verificada"], flush=True)
    n = len(pruebas)
    def resumen(lst):
        return {"verificadas": sum(x["verificada"] for x in lst), "exactas": sum(x["exacta"] for x in lst), "total": n,
                "pct_verificadas": round(100 * sum(x["verificada"] for x in lst) / n, 1)}
    por_tipo = {}
    for f in filas:
        d = por_tipo.setdefault(f["tipo"], {"n": 0, "base": 0, "ajustado": 0})
        d["n"] += 1; d["base"] += f["base_eval"]["verificada"]; d["ajustado"] += f["ajustado_eval"]["verificada"]
    metr = {"pruebas_reservadas": n, "base": resumen(res["base"]), "ajustado": resumen(res["ajustado"]), "por_tipo": por_tipo,
            "gpu": torch.cuda.get_device_name(0)}
    (SALIDA / "comparacion.json").write_text(json.dumps(filas, ensure_ascii=False, indent=1), encoding="utf-8")
    (SALIDA / "metricas_comparacion.json").write_text(json.dumps(metr, ensure_ascii=False, indent=1), encoding="utf-8")
    print("EVALUACION_COMPLETA", json.dumps(metr, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
