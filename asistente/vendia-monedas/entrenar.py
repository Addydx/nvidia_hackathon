"""Entrenamiento LoRA de Qwen2.5-1.5B-Instruct para el asistente de monedas de VendIA (PyTorch + CUDA, T4).

Bucle propio con FP16 (AMP + GradScaler), semilla fija y pérdida solo sobre los tokens de la respuesta.
Guarda: adaptador `vendia-monedas-lora/`, `config.json`, `train_log.jsonl` y `metricas.json`.
"""
import json, math, os, random, sys, time
from pathlib import Path
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import LoraConfig, get_peft_model
import transformers, peft

AQUI = Path(__file__).parent
BASE = os.environ.get("VENDIA_BASE", "Qwen/Qwen2.5-1.5B-Instruct")
SALIDA = Path(os.environ.get("VENDIA_SALIDA", AQUI))
CFG = dict(base=BASE, semilla=42, epocas=3, batch=8, lr=2e-4, warmup=0.05, peso_decay=0.0, max_len=512,
           lora=dict(r=16, alpha=32, dropout=0.05, modulos=["q_proj", "k_proj", "v_proj", "o_proj"]), precision="fp16 (AMP)")


def cargar(ruta):
    return [json.loads(l) for l in open(ruta, encoding="utf-8")]


def tokenizar(tok, ej):
    msgs = ej["messages"]
    prompt = tok.apply_chat_template(msgs[:-1], tokenize=False, add_generation_prompt=True)
    resp = msgs[-1]["content"] + "<|im_end|>\n"
    p = tok(prompt, add_special_tokens=False)["input_ids"]
    r = tok(resp, add_special_tokens=False)["input_ids"]
    ids = (p + r)[: CFG["max_len"]]
    labels = ([-100] * len(p) + r)[: CFG["max_len"]]
    return ids, labels


def lote(tok, items):
    n = max(len(i) for i, _ in items)
    pad = tok.pad_token_id
    ids = torch.tensor([i + [pad] * (n - len(i)) for i, _ in items])
    lab = torch.tensor([l + [-100] * (n - len(l)) for _, l in items])
    att = torch.tensor([[1] * len(i) + [0] * (n - len(i)) for i, _ in items])
    return ids.cuda(), att.cuda(), lab.cuda()


@torch.no_grad()
def perdida(model, tok, datos):
    model.eval()
    tot, n = 0.0, 0
    for i in range(0, len(datos), 8):
        ids, att, lab = lote(tok, datos[i:i + 8])
        with torch.autocast("cuda", dtype=torch.float16):
            out = model(input_ids=ids, attention_mask=att, labels=lab)
        k = int((lab[:, 1:] != -100).sum())
        tot += float(out.loss) * k
        n += k
    model.train()
    return tot / max(n, 1)


def main():
    assert torch.cuda.is_available(), "CUDA no disponible: el entrenamiento exige la GPU NVIDIA"
    random.seed(CFG["semilla"]); torch.manual_seed(CFG["semilla"]); torch.cuda.manual_seed_all(CFG["semilla"])
    gpu = torch.cuda.get_device_name(0)
    print("GPU", gpu, "| torch", torch.__version__, "| cuda", torch.version.cuda, flush=True)
    tok = AutoTokenizer.from_pretrained(BASE)
    model = AutoModelForCausalLM.from_pretrained(BASE, torch_dtype=torch.float16, device_map={"": 0})
    train = [tokenizar(tok, e) for e in cargar(AQUI / "datos" / "train.jsonl")]
    valid = [tokenizar(tok, e) for e in cargar(AQUI / "datos" / "valid.jsonl")]
    model.config.use_cache = False
    l0 = perdida(model, tok, valid)
    print("perdida de validacion del modelo base:", round(l0, 4), flush=True)
    cfg = LoraConfig(r=CFG["lora"]["r"], lora_alpha=CFG["lora"]["alpha"], lora_dropout=CFG["lora"]["dropout"],
                     target_modules=CFG["lora"]["modulos"], task_type="CAUSAL_LM")
    model = get_peft_model(model, cfg)
    for p in model.parameters():
        if p.requires_grad:
            p.data = p.data.float()  # adaptador en FP32; base en FP16
    train_params = [p for p in model.parameters() if p.requires_grad]
    n_train = sum(p.numel() for p in train_params)
    print("parametros entrenables:", n_train, flush=True)
    opt = torch.optim.AdamW(train_params, lr=CFG["lr"], weight_decay=CFG["peso_decay"])
    pasos_epoca = math.ceil(len(train) / CFG["batch"])
    total = pasos_epoca * CFG["epocas"]
    calentamiento = max(1, int(total * CFG["warmup"]))
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: (s + 1) / calentamiento if s < calentamiento else 0.5 * (1 + math.cos(math.pi * (s - calentamiento) / max(1, total - calentamiento))))
    scaler = torch.amp.GradScaler("cuda")
    SALIDA.mkdir(exist_ok=True, parents=True)
    log = open(SALIDA / "train_log.jsonl", "w", encoding="utf-8")
    metr = {"gpu": gpu, "perdida_validacion_base": l0, "perdida_validacion_por_epoca": [], "pasos": total}
    paso, t0 = 0, time.time()
    model.train()
    for ep in range(CFG["epocas"]):
        orden = list(range(len(train))); random.Random(CFG["semilla"] + ep).shuffle(orden)
        for i in range(0, len(orden), CFG["batch"]):
            ids, att, lab = lote(tok, [train[j] for j in orden[i:i + CFG["batch"]]])
            with torch.autocast("cuda", dtype=torch.float16):
                loss = model(input_ids=ids, attention_mask=att, labels=lab).loss
            opt.zero_grad(set_to_none=True)
            scaler.scale(loss).backward()
            scaler.unscale_(opt)
            torch.nn.utils.clip_grad_norm_(train_params, 1.0)
            scaler.step(opt); scaler.update(); sched.step(); paso += 1
            if paso % 10 == 0 or paso == total:
                reg = {"paso": paso, "epoca": ep + 1, "perdida": round(float(loss), 4), "lr": sched.get_last_lr()[0],
                       "mem_gpu_gb": round(torch.cuda.max_memory_allocated() / 1e9, 2), "seg": round(time.time() - t0, 1)}
                log.write(json.dumps(reg) + "\n"); log.flush(); print(reg, flush=True)
        lv = perdida(model, tok, valid)
        metr["perdida_validacion_por_epoca"].append(lv)
        print(f"epoca {ep + 1}: perdida de validacion {lv:.4f}", flush=True)
    metr["segundos_entrenamiento"] = round(time.time() - t0, 1)
    metr["perdida_validacion_final"] = metr["perdida_validacion_por_epoca"][-1]
    metr["parametros_entrenables"] = n_train
    metr["pico_memoria_gpu_gb"] = round(torch.cuda.max_memory_allocated() / 1e9, 2)
    model.save_pretrained(SALIDA / "vendia-monedas-lora")
    CFG.update(versiones=dict(torch=torch.__version__, cuda=torch.version.cuda, transformers=transformers.__version__, peft=peft.__version__),
               gpu=gpu, ejemplos=dict(train=len(train), valid=len(valid)))
    (SALIDA / "config.json").write_text(json.dumps(CFG, ensure_ascii=False, indent=1), encoding="utf-8")
    (SALIDA / "metricas_entrenamiento.json").write_text(json.dumps(metr, ensure_ascii=False, indent=1), encoding="utf-8")
    print("ENTRENAMIENTO_COMPLETO", json.dumps({k: metr[k] for k in ("perdida_validacion_base", "perdida_validacion_final", "segundos_entrenamiento")}), flush=True)


if __name__ == "__main__":
    main()
