
# ===== preaparacion del ecosistema ===============
import subprocess
from pathlib import Path
from pathlib import Path
import shutil
import hashlib
import json
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from IPython.display import display
from collections import Counter


ENV = Path("/root/vendia-env")
PYTHON = str(ENV / "bin/python")

def ejecutar(comando):
    subprocess.run(comando, check=True)

# 1. Instalar dependencias del sistema
print("Instalando dependencias del sistema...")

ejecutar(["apt-get", "update", "-qq"])

ejecutar([
    "apt-get", "install", "-y",
    "python3.10-venv",
    "libgl1",
    "libglib2.0-0"
])

# 2. Crear entorno virtual
print("Creando entorno VendIA...")

ejecutar([
    "python3.10", "-m", "venv", str(ENV)
])

# 3. Instalar PyTorch compatible con CUDA
print("Instalando PyTorch...")

ejecutar([
    PYTHON, "-m", "pip", "install",
    "torch==2.6.0+cu118",
    "torchvision==0.21.0+cu118",
    "--index-url",
    "https://download.pytorch.org/whl/cu118"
])

# 4. Instalar dependencias del proyecto
print("Instalando Ultralytics y dependencias...")

ejecutar([
    PYTHON, "-m", "pip", "install",
    "torch==2.6.0+cu118",
    "torchvision==0.21.0+cu118",
    "ultralytics==8.4.215",
    "pandas",
    "matplotlib",
    "pyyaml",
    "pillow",
    "ipykernel",
    "onnx"
])

# 5. Registrar kernel en JupyterLab
print("Registrando kernel VendIA...")

ejecutar([
    PYTHON, "-m", "ipykernel", "install",
    "--user",
    "--name", "vendia",
    "--display-name", "Python (VendIA)"
])

# 6. Verificar funcionamiento
ejecutar([
    PYTHON, "-c",
    """
import torch
import ultralytics
import cv2

print("PyTorch:", torch.__version__)
print("CUDA:", torch.version.cuda)
print("Ultralytics:", ultralytics.__version__)
print("OpenCV:", cv2.__version__)
print("GPU disponible:", torch.cuda.is_available())

assert torch.cuda.is_available(), "GPU no disponible"

print("GPU:", torch.cuda.get_device_name(0))

tensor = torch.rand(3, 3, device="cuda")
print(tensor)

print("ENTORNO VENDIA LISTO")
"""
])

# =====================================
# ======== configuracion 
# ====================================

from pathlib import Path
from collections import Counter
from datetime import datetime
import json
import zipfile
import shutil
import math
import sys

import cv2
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from IPython.display import display
import yaml
import torch
from ultralytics import YOLO

ROOT = Path('/dli/task')
# Si tienes varias versiones del ZIP, escribe el nombre exacto aquí.
# None: buscar automáticamente el ZIP v4 original.
NOMBRE_ZIP = None
ENTRADA = ROOT / 'verificacion'
SALIDA = ROOT / 'verificacion_procesada'
CONTORNOS = ROOT / 'verificacion_contornos'
MASCARAS = ROOT / 'verificacion_mascaras'
OUT = ROOT / 'runs_monedas'

# Entrenamiento original de vendia.py
ENTRENAR = True
# Si ENTRENAR=False, especifica el best.pt exacto que quieres reutilizar.
MODELO_EXISTENTE = None  # Ejemplo: '/dli/task/runs_monedas/entrenamiento_monedas/weights/best.pt'
EPOCHS = 80
IMGSZ = 640
BATCH = 16
PATIENCE = 15
WORKERS = 0  # DLI: evita el error de memoria compartida observado con workers=2.
SEED = 42
DEVICE = 0
CONF = 0.25
BATCH_PREDICCION = 8

# Limpieza por circunferencias exteriores (última versión).
RADIO_MINIMO = 0.025
RADIO_MAXIMO = 0.25
DISTANCIA_MINIMA = 0.065
PERFECCION_CIRCULO = 0.85
TOLERANCIA_DUPLICADOS = 0.70
MARGEN = 2
MEJORAR_CALIDAD = False  # False: conservar exactamente los píxeles de las monedas.
COMPARAR_ORIGINALES = True
MOSTRAR_LIMPIEZA = True
MAX_MOSTRAR = 12
EXTENSIONES = {'.jpg', '.jpeg', '.png', '.webp', '.bmp'}
CLASSES = ['peso1', 'peso 2', 'peso 5', 'peso10']  # nombres originales COCO
NOMBRES_YOLO = {0: 'peso1', 1: 'peso2', 2: 'peso5', 3: 'peso10'}
VALORES = {'peso1': 1, 'peso2': 2, 'peso5': 5, 'peso10': 10}

# Opcional: escribe el importe real contado a mano por fotografía original.
# Si está vacío, solo se informa el total estimado, NO una exactitud real.
TOTALES_REALES = {
    # 'foto1.jpg': 25.0,
    # 'foto2.jpeg': 37.0,
}
assert torch.cuda.is_available(), 'GPU no disponible. Selecciona Python (VendIA).'
print('Python:', sys.executable, '| PyTorch:', torch.__version__)
print('GPU:', torch.cuda.get_device_name(DEVICE))
for carpeta in [ENTRADA, SALIDA, CONTORNOS, MASCARAS, OUT]:
    carpeta.mkdir(parents=True, exist_ok=True)



# ===== preaparacion del ecosistema ===============
import subprocess
from pathlib import Path

ENV = Path("/root/vendia-env")
PYTHON = str(ENV / "bin/python")

def ejecutar(comando):
    subprocess.run(comando, check=True)

# 1. Instalar dependencias del sistema
print("Instalando dependencias del sistema...")

ejecutar(["apt-get", "update", "-qq"])

ejecutar([
    "apt-get", "install", "-y",
    "python3.10-venv",
    "libgl1",
    "libglib2.0-0"
])

# 2. Crear entorno virtual
print("Creando entorno VendIA...")

ejecutar([
    "python3.10", "-m", "venv", str(ENV)
])

# 3. Instalar PyTorch compatible con CUDA
print("Instalando PyTorch...")

ejecutar([
    PYTHON, "-m", "pip", "install",
    "torch==2.6.0+cu118",
    "torchvision==0.21.0+cu118",
    "--index-url",
    "https://download.pytorch.org/whl/cu118"
])

# 4. Instalar dependencias del proyecto
print("Instalando Ultralytics y dependencias...")

ejecutar([
    PYTHON, "-m", "pip", "install",
    "torch==2.6.0+cu118",
    "torchvision==0.21.0+cu118",
    "ultralytics==8.4.215",
    "pandas",
    "matplotlib",
    "pyyaml",
    "pillow",
    "ipykernel",
    "onnx"
])

# 5. Registrar kernel en JupyterLab
print("Registrando kernel VendIA...")

ejecutar([
    PYTHON, "-m", "ipykernel", "install",
    "--user",
    "--name", "vendia",
    "--display-name", "Python (VendIA)"
])

# 6. Verificar funcionamiento
ejecutar([
    PYTHON, "-c",
    """
import torch
import ultralytics
import cv2

print("PyTorch:", torch.__version__)
print("CUDA:", torch.version.cuda)
print("Ultralytics:", ultralytics.__version__)
print("OpenCV:", cv2.__version__)
print("GPU disponible:", torch.cuda.is_available())

assert torch.cuda.is_available(), "GPU no disponible"

print("GPU:", torch.cuda.get_device_name(0))

tensor = torch.rand(3, 3, device="cuda")
print(tensor)

print("ENTORNO VENDIA LISTO")
"""
])

# ============ busca y descomprimi el zip de las imagenes ===================

def buscar_imagenes(carpeta):
    return sorted(p for p in carpeta.iterdir()
                  if p.is_file() and p.suffix.lower() in EXTENSIONES)


def localizar_zip(root, nombre=None):
    if nombre is not None:
        ruta = root / nombre
        if not ruta.is_file():
            raise FileNotFoundError(ruta)
        return ruta
    candidatos = sorted(root.glob('custom_monedas_detector.v4i.coco*.zip'))
    if not candidatos:
        candidatos = sorted(root.glob('custom_monedas_detector*.zip'))
    if len(candidatos) != 1:
        raise ValueError('Selecciona NOMBRE_ZIP explícitamente. ZIP encontrados: '
                         + str([p.name for p in candidatos]))
    return candidatos[0]


def descomprimir_dataset(zip_path, destino):
    # Usar una carpeta nueva por ejecución para no mezclar versiones del dataset.
    destino.mkdir(parents=True, exist_ok=False)
    with zipfile.ZipFile(zip_path, 'r') as archivo:
        # Evitar que una entrada de ZIP escriba fuera de la carpeta de datos.
        for miembro in archivo.infolist():
            ruta = (destino / miembro.filename).resolve()
            if not ruta.is_relative_to(destino.resolve()):
                raise ValueError(f'Ruta insegura en ZIP: {miembro.filename}')
        archivo.extractall(destino)
    candidatos = [p.parent.parent for p in destino.rglob('_annotations.coco.json')
                  if p.parent.name == 'train']
    candidatos = [p for p in candidatos if (p / 'valid' / '_annotations.coco.json').is_file()]
    if len(candidatos) != 1:
        raise ValueError('El ZIP debe tener train y valid con _annotations.coco.json.')
    base = candidatos[0]
    print('Dataset descomprimido en:', base)
    return base
zip_path = localizar_zip(ROOT, NOMBRE_ZIP)
print('ZIP seleccionado:', zip_path)
run_id = datetime.now().strftime('%Y%m%d_%H%M%S_%f')
base = descomprimir_dataset(zip_path, ROOT / 'monedas_dataset' / run_id)
yolo_dir = ROOT / 'monedas_yolo_vendia' / run_id
for split in ['train', 'valid']:
    datos = json.loads((base / split / '_annotations.coco.json').read_text(encoding='utf-8'))
    print(split, ':', len(datos['images']), 'imágenes')
# ================================================
# ======================= Convertir COCO A YOLO y revisar la distrubucion ========================
# ================================================
def convertir_coco_yolo(base, yolo_dir):
    # Misma conversión y mismo orden de clases que vendia.py.
    # No se cambian las particiones originales ni se redimensionan imágenes.
    class_map = {nombre: i for i, nombre in enumerate(CLASSES)}
    estadisticas = []
    for split in ['train', 'valid']:
        img_dir = yolo_dir / 'images' / split
        lab_dir = yolo_dir / 'labels' / split
        img_dir.mkdir(parents=True, exist_ok=False)
        lab_dir.mkdir(parents=True, exist_ok=False)
        coco = json.loads((base / split / '_annotations.coco.json').read_text(encoding='utf-8'))
        category_map = {cat['id']: cat['name'] for cat in coco['categories']}
        images = {img['id']: img for img in coco['images']}
        etiquetas = {}
        for img in images.values():
            filename = Path(img['file_name'])
            if filename.is_absolute() or '..' in filename.parts:
                raise ValueError(f'Nombre inválido: {filename}')
            src = base / split / filename
            dst = img_dir / filename
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
            label_path = (lab_dir / filename).with_suffix('.txt')
            label_path.parent.mkdir(parents=True, exist_ok=True)
            if label_path in etiquetas.values():
                raise ValueError(f'Colisión de etiquetas: {label_path}')
            label_path.write_text('', encoding='utf-8')
            etiquetas[img['id']] = label_path
        conteo = Counter()
        ignoradas = Counter()
        for ann in coco['annotations']:
            img = images[ann['image_id']]
            nombre = category_map[ann['category_id']]
            if nombre not in class_map:
                ignoradas[nombre] += 1
                continue
            width, height = img['width'], img['height']
            x, y, w, h = ann['bbox']
            class_id = class_map[nombre]
            xc = (x + w / 2) / width
            yc = (y + h / 2) / height
            wn = w / width
            hn = h / height
            with etiquetas[ann['image_id']].open('a', encoding='utf-8') as f:
                f.write(f'{class_id} {xc:.6f} {yc:.6f} {wn:.6f} {hn:.6f}\n')
            conteo[class_id] += 1
        fila = {'Partición': split, 'Imágenes': len(images),
                **{NOMBRES_YOLO[i]: conteo[i] for i in NOMBRES_YOLO},
                'Total monedas': sum(conteo.values())}
        estadisticas.append(fila)
        print('\n', split, fila, 'Anotaciones ignoradas:', dict(ignoradas))
    yaml_path = yolo_dir / 'data.yaml'
    yaml_path.write_text(yaml.safe_dump({
        'path': str(yolo_dir.resolve()), 'train': 'images/train',
        'val': 'images/valid', 'names': NOMBRES_YOLO,
    }, sort_keys=False), encoding='utf-8')
    return yaml_path, pd.DataFrame(estadisticas)
YAML, df_dataset = convertir_coco_yolo(base, yolo_dir)
display(df_dataset)
print(YAML.read_text())

#================================================
# ======================== Entrenamiento del modelo
# ================================================
def entrenar_modelo(yaml_path):
    model = YOLO('yolo11n.pt')
    model.train(
        data=str(yaml_path), epochs=EPOCHS, imgsz=IMGSZ,
        batch=BATCH, patience=PATIENCE, workers=WORKERS,
        project=str(OUT), name='entrenamiento_monedas',
        pretrained=True, device=DEVICE, seed=SEED
    )
    run = Path(model.trainer.save_dir)
    model_path = run / 'weights' / 'best.pt'
    if not model_path.is_file():
        raise FileNotFoundError(model_path)
    print('Modelo entrenado:', model_path)
    return model_path
if ENTRENAR:
    MODEL_PATH = entrenar_modelo(YAML)
else:
    if not MODELO_EXISTENTE:
        raise ValueError('Indica MODELO_EXISTENTE cuando ENTRENAR=False.')
    MODEL_PATH = Path(MODELO_EXISTENTE).expanduser().resolve()
    if not MODEL_PATH.is_file():
        raise FileNotFoundError(MODEL_PATH)
best_model = YOLO(str(MODEL_PATH))
if {str(n).lower().replace(' ', '') for n in best_model.names.values()} != set(VALORES):
    raise ValueError(f'Clases incompatibles: {best_model.names}')
print('Modelo:', MODEL_PATH)
print('Clases:', best_model.names)

# ================================================
# ======================== Validacion dell modelo
# ================================================

def validar_modelo(best_model, yaml_path, reporte_dir):
    metrics = best_model.val(data=str(yaml_path), split='val',
        imgsz=IMGSZ, device=DEVICE, workers=WORKERS, plots=True,
        project=str(reporte_dir), name='validacion_dataset')
    df = pd.DataFrame([{'Precision': metrics.box.mp, 'Recall': metrics.box.mr,
                       'mAP50': metrics.box.map50, 'mAP50-95': metrics.box.map}])
    display(df)
    df.to_csv(reporte_dir / 'metricas_validacion.csv', index=False)
    print('Estas métricas corresponden al conjunto valid original, no a una prueba independiente.')
    return df
reporte_dir = OUT / ('evaluacion_vendia_' + datetime.now().strftime('%Y%m%d_%H%M%S_%f'))
reporte_dir.mkdir(parents=True)
(reporte_dir / 'modelo_utilizado.txt').write_text(str(MODEL_PATH), encoding='utf-8')
df_dataset.to_csv(reporte_dir / 'distribucion_dataset.csv', index=False)
df_metricas_validacion = validar_modelo(best_model, YAML, reporte_dir)

# ================================================
# ======================== Definir la limpieza por circunferencias exteriores
# ================================================

def detectar_circunferencias(imagen):
    alto, ancho = imagen.shape[:2]
    lado = min(alto, ancho)
    gris = cv2.cvtColor(imagen, cv2.COLOR_BGR2GRAY)
    # Suavizar solo la copia utilizada para localizar contornos.
    gris = cv2.GaussianBlur(gris, (5, 5), sigmaX=1.1)
    circulos = cv2.HoughCircles(
        gris, cv2.HOUGH_GRADIENT_ALT, dp=1.5,
        minDist=lado * DISTANCIA_MINIMA, param1=200,
        param2=PERFECCION_CIRCULO,
        minRadius=max(8, int(lado * RADIO_MINIMO)),
        maxRadius=max(9, int(lado * RADIO_MAXIMO)))
    return [] if circulos is None else circulos[0].tolist()


def eliminar_duplicados(circulos):
    # Priorizar círculos grandes y descartar los interiores concéntricos.
    seleccionados = []
    for x, y, r in sorted(circulos, key=lambda c: c[2], reverse=True):
        duplicado = any(np.hypot(x-cx, y-cy) < max(r, cr)*TOLERANCIA_DUPLICADOS
                        for cx, cy, cr in seleccionados)
        if not duplicado:
            seleccionados.append((x, y, r))
    return seleccionados


def crear_mascara(imagen, circulos):
    mascara = np.zeros(imagen.shape[:2], dtype=np.uint8)
    revision = imagen.copy()
    for numero, (x, y, radio) in enumerate(circulos, start=1):
        centro = (int(round(x)), int(round(y)))
        r = int(round(radio)) + MARGEN
        cv2.circle(mascara, centro, r, 255, thickness=-1)
        cv2.circle(revision, centro, r, (0,255,0), 2)
        cv2.putText(revision, str(numero), centro, cv2.FONT_HERSHEY_SIMPLEX,
                    .6, (0,0,255), 2)
    return mascara, revision


def mejorar_calidad(imagen):
    limpia = cv2.fastNlMeansDenoisingColored(imagen, None, 3, 3, 7, 21)
    l, a, b = cv2.split(cv2.cvtColor(limpia, cv2.COLOR_BGR2LAB))
    l = cv2.createCLAHE(clipLimit=1.5, tileGridSize=(8,8)).apply(l)
    suave = cv2.GaussianBlur(l, (0,0), sigmaX=1)
    l = cv2.addWeighted(l, 1.25, suave, -.25, 0)
    return cv2.cvtColor(cv2.merge((l,a,b)), cv2.COLOR_LAB2BGR)


def guardar_imagen(ruta, imagen):
    if not cv2.imwrite(str(ruta), imagen):
        raise OSError(f'No se pudo guardar {ruta}')

## Limpiar la fotografias de verificacion
def limpiar_fotografia(original):
    iniciales = detectar_circunferencias(original)
    circulos = eliminar_duplicados(iniciales)
    if not circulos:
        return None, None, None, 0, len(iniciales)
    mascara, revision = crear_mascara(original, circulos)
    fuente = mejorar_calidad(original) if MEJORAR_CALIDAD else original
    limpia = np.full_like(original, 255)
    limpia[mascara > 0] = fuente[mascara > 0]
    return limpia, revision, mascara, len(circulos), len(iniciales)

# ================================================
# ======================== Limpiar las fotografias de verificacion
# ========================

def procesar_verificacion(imagenes):
    # Solo las rutas producidas en esta ejecución se entregan a YOLO.
    # Nunca se usa un archivo viejo de salida cuando falla la limpieza actual.
    procesadas = {}
    estado = []
    for indice, ruta in enumerate(imagenes):
        original = cv2.imread(str(ruta))
        if original is None:
            estado.append({'Fotografía': ruta.name, 'Círculos': None, 'Estado': 'No se pudo leer'})
            print('No se pudo leer:', ruta.name)
            continue
        limpia, revision, mascara, cantidad, iniciales = limpiar_fotografia(original)
        if limpia is None:
            estado.append({'Fotografía': ruta.name, 'Círculos': 0, 'Estado': 'Sin circunferencias; revisar'})
            print('Sin circunferencias; revisar:', ruta.name)
            continue
        nombre = ruta.name + '.png'
        destino = SALIDA / nombre
        guardar_imagen(destino, limpia)
        guardar_imagen(CONTORNOS / nombre, revision)
        guardar_imagen(MASCARAS / nombre, mascara)
        procesadas[ruta.name] = destino
        estado.append({'Fotografía': ruta.name, 'Círculos': cantidad, 'Estado': 'Procesada; revisar contornos'})
        print(f'{ruta.name}: {iniciales} candidatos -> {cantidad} circunferencias')
        if MOSTRAR_LIMPIEZA and indice < MAX_MOSTRAR:
            fig, axes = plt.subplots(1, 4, figsize=(16, 7))
            for ax, img, titulo in zip(axes, [original, revision, mascara, limpia],
                    ['Original', f'Contornos: {cantidad}', 'Máscara', 'Fondo blanco']):
                ax.imshow(img, cmap='gray', vmin=0, vmax=255) if img.ndim == 2 else ax.imshow(cv2.cvtColor(img,cv2.COLOR_BGR2RGB))
                ax.set_title(titulo); ax.axis('off')
            fig.suptitle(ruta.name); fig.tight_layout(); plt.show(); plt.close(fig)
    return procesadas, pd.DataFrame(estado)
imagenes = buscar_imagenes(ENTRADA)
assert imagenes, f'Sube fotografías a {ENTRADA}'
procesadas, df_estado = procesar_verificacion(imagenes)
df_estado.to_csv(reporte_dir / 'estado_limpieza.csv', index=False)
display(df_estado)
print('Imágenes limpias:', len(procesadas), '/', len(imagenes))

# ================================================
# ========================detectar y sumar las monedas de las fotografias
# ================================================

def nombre_clase(nombre):
    return str(nombre).lower().replace(' ', '')


def predecir_y_contar(best_model, rutas, reporte_dir, nombre_salida):
    # rutas: {nombre original: ruta real que recibe YOLO}
    nombre_por_ruta = {str(Path(p).resolve()): n for n,p in rutas.items()}
    filas = []
    valores_totales = []
    previews = []
    columnas = ['Fotografía', 'Monedas de $1', 'Monedas de $2', 'Monedas de $5',
                'Monedas de $10', 'Cantidad de monedas', 'Total detectado (MXN)']
    if not rutas:
        return pd.DataFrame(columns=columnas), valores_totales
    resultados = best_model.predict(
        source=[str(p) for p in rutas.values()], imgsz=IMGSZ,
        conf=CONF, device=DEVICE, batch=BATCH_PREDICCION,
        save=True, project=str(reporte_dir), name=nombre_salida,
        exist_ok=True, verbose=False, stream=True)
    for resultado in resultados:
        nombre = nombre_por_ruta[str(Path(resultado.path).resolve())]
        valores = [VALORES[nombre_clase(best_model.names[int(box.cls.item())])]
                   for box in resultado.boxes]
        conteo = Counter(valores)
        total = sum(valores)
        valores_totales.extend(valores)
        filas.append({'Fotografía': nombre,
                       **{f'Monedas de ${v}': conteo[v] for v in [1,2,5,10]},
                       'Cantidad de monedas': len(valores), 'Total detectado (MXN)': total})
        if len(previews) < MAX_MOSTRAR:
            previews.append((nombre, resultado.plot()[:,:,::-1], total))
    df = pd.DataFrame(filas, columns=columnas)
    print('\nREPORTE:', nombre_salida)
    display(df)
    print('Array de valores:', valores_totales)
    print('Fotografías analizadas:', len(df))
    print('Monedas detectadas:', len(valores_totales))
    print(f'TOTAL GENERAL: ${sum(valores_totales)} MXN')
    print('El total presupone que no se repiten monedas entre fotografías.')
    df.to_csv(reporte_dir / f'{nombre_salida}.csv', index=False)
    if previews:
        cols = 3; rows = math.ceil(len(previews)/cols)
        fig, axes = plt.subplots(rows, cols, figsize=(16,rows*5), squeeze=False)
        for ax in axes.flat: ax.axis('off')
        for ax,(nombre,img,total) in zip(axes.flat, previews):
            ax.imshow(img); ax.set_title(f'{nombre}\nTotal: ${total} MXN')
        fig.tight_layout(); fig.savefig(reporte_dir / f'{nombre_salida}.png', dpi=150)
        plt.show(); plt.close(fig)
    return df, valores_totales
assert procesadas, 'No hay imágenes limpias de esta ejecución. Revisa los contornos.'
df_limpias, valores_totales = predecir_y_contar(best_model, procesadas, reporte_dir, 'deteccion_imagenes_limpias')
print('Fotos sin evaluar después de limpiar:', len(imagenes) - len(df_limpias))

# Comparar fotografias originales y limpias

def comparar_resultados(df_estado, df_limpias, df_originales, reporte_dir):
    comparacion = df_estado.merge(df_limpias[['Fotografía', 'Cantidad de monedas', 'Total detectado (MXN)']]
            .rename(columns={'Cantidad de monedas':'Monedas limpias', 'Total detectado (MXN)':'Total limpio'}),
            on='Fotografía', how='left', validate='one_to_one')
    if df_originales is not None:
        comparacion = comparacion.merge(df_originales[['Fotografía', 'Cantidad de monedas','Total detectado (MXN)']]
                .rename(columns={'Cantidad de monedas':'Monedas originales', 'Total detectado (MXN)':'Total original'}),
                on='Fotografía', how='left', validate='one_to_one')
    comparacion['Total real'] = comparacion['Fotografía'].map(TOTALES_REALES)
    resumen = []
    etiquetas = ['Total limpio'] + (['Total original'] if df_originales is not None else [])
    for columna in etiquetas:
        comparacion[f'Error absoluto ({columna})'] = (comparacion[columna] - comparacion['Total real']).abs()
    # Comparación justa: usar las mismas fotografías etiquetadas y procesadas por todos los métodos.
    evaluables = comparacion.dropna(subset=['Total real'] + etiquetas)
    for columna in etiquetas:
        errores = evaluables[f'Error absoluto ({columna})']
        if len(errores):
            resumen.append({'Método': columna, 'Fotos comparables': len(errores),
                           'MAE (MXN)': errores.mean(), 'Importes correctos (%)': 100*(errores < 1e-6).mean()})
    display(comparacion)
    comparacion.to_csv(reporte_dir / 'comparacion_verificacion.csv', index=False)
    if resumen:
        df_metricas = pd.DataFrame(resumen)
        display(df_metricas)
        df_metricas.to_csv(reporte_dir / 'metricas_monetarias.csv', index=False)
        print('Fotos con importe real:', comparacion['Total real'].notna().sum(),
              '| Fotos comparables:', len(evaluables))
    else:
        print('Para medir exactitud y MAE, completa TOTALES_REALES con importes contados manualmente.')
    return comparacion
df_originales = None
if COMPARAR_ORIGINALES:
    legibles = {p.name: p for p in imagenes if p.name not in set(df_estado.loc[df_estado['Estado']=='No se pudo leer', 'Fotografía'])}
    df_originales, _ = predecir_y_contar(best_model, legibles, reporte_dir, 'deteccion_imagenes_originales')
df_comparacion = comparar_resultados(df_estado, df_limpias, df_originales, reporte_dir)
print('Modelo:', MODEL_PATH)
print('Informes y detecciones:', reporte_dir)

import hashlib
import json
import shutil
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

from pathlib import Path
from collections import Counter
from IPython.display import display

# Usa exactamente el modelo cargado en la celda 4.
PESOS = Path(MODEL_PATH).resolve()
assert PESOS.is_file(), f'No existe {PESOS}'
RUN_ENTRENAMIENTO = PESOS.parent.parent
EVIDENCIAS = Path(reporte_dir) / 'evidencias_adicionales'
EVIDENCIAS.mkdir(parents=True, exist_ok=True)
DESTINO_PESOS = EVIDENCIAS / 'VendIA_Modelo.pt'
if PESOS != DESTINO_PESOS.resolve():
    shutil.copy2(PESOS, DESTINO_PESOS)
# No se cambia el checkpoint ni se vuelve a entrenar.
sha = hashlib.sha256(DESTINO_PESOS.read_bytes()).hexdigest()
(EVIDENCIAS / 'modelo.json').write_text(json.dumps({
    'archivo': DESTINO_PESOS.name, 'origen': str(PESOS),
    'sha256': sha, 'bytes': DESTINO_PESOS.stat().st_size,
    'clases': best_model.names
}, indent=2, ensure_ascii=False), encoding='utf-8')
print('Pesos guardados:', DESTINO_PESOS)
print('SHA256:', sha)

# Guarda configuraciones y evidencias originales si existen.
for nombre in ['results.csv', 'args.yaml', 'results.png', 'confusion_matrix.png',
               'confusion_matrix_normalized.png', 'BoxPR_curve.png',
               'BoxP_curve.png', 'BoxR_curve.png', 'BoxF1_curve.png']:
    origen = RUN_ENTRENAMIENTO / nombre
    if origen.is_file():
        shutil.copy2(origen, EVIDENCIAS / nombre)
if Path(YAML).is_file():
    shutil.copy2(YAML, EVIDENCIAS / 'data.yaml')

def guardar_grafica(fig, nombre):
    fig.tight_layout()
    fig.savefig(EVIDENCIAS / nombre, dpi=160, bbox_inches='tight')
    plt.show()
    plt.close(fig)

historia = RUN_ENTRENAMIENTO / 'results.csv'
if historia.is_file():
    historial = pd.read_csv(historia)
    historial.columns = historial.columns.str.strip()
    epocas = historial['epoch'] if 'epoch' in historial else np.arange(1,len(historial)+1)
    # Comparar pérdidas de entrenamiento y validación por componente.
    for componente in ['box_loss', 'cls_loss', 'dfl_loss']:
        fig, ax = plt.subplots(figsize=(9,4))
        for split, etiqueta in [('train','Entrenamiento'), ('val','Validación')]:
            col = f'{split}/{componente}'
            if col in historial:
                ax.plot(epocas, historial[col], label=etiqueta)
        ax.set(title=f'Evolución de {componente}', xlabel='Época', ylabel='Pérdida')
        ax.grid(alpha=.25)
        if ax.lines:
            ax.legend(); guardar_grafica(fig, f'perdida_{componente}.png')
        else:
            plt.close(fig)
    fig, ax = plt.subplots(figsize=(10,5))
    for col, etiqueta in [('metrics/precision(B)','Precision'), ('metrics/recall(B)','Recall'),
                          ('metrics/mAP50(B)','mAP@50'), ('metrics/mAP50-95(B)','mAP@50-95')]:
        if col in historial:
            ax.plot(epocas, historial[col]*100, label=etiqueta)
    ax.set(title='Métricas de validación por época', xlabel='Época', ylabel='Porcentaje', ylim=(0,105))
    ax.grid(alpha=.25)
    if ax.lines:
        ax.legend(); guardar_grafica(fig, 'evolucion_metricas.png')
    else:
        plt.close(fig)
else:
    print('No hay results.csv junto al checkpoint. No se inventarán curvas de entrenamiento.')

# Métricas obtenidas en la celda 5 (validación del checkpoint).
if 'df_metricas_validacion' in globals():
    tabla = df_metricas_validacion.copy()
    if {'Precision','Recall','mAP50','mAP50-95'}.issubset(tabla.columns):
        p, r = tabla.loc[tabla.index[0], ['Precision','Recall']]
        tabla['F1 armónico macro-resumen'] = 2*p*r/(p+r) if p+r else 0.0
        tabla.to_csv(EVIDENCIAS / 'metricas_vision.csv', index=False)
        display(tabla)
        fig, ax = plt.subplots(figsize=(9,4))
        (tabla.iloc[0]*100).plot.bar(ax=ax, rot=15)
        ax.set(title='Métricas del modelo en validación', ylabel='Porcentaje', ylim=(0,105))
        guardar_grafica(fig, 'metricas_vision.png')
print('Evidencias:', EVIDENCIAS)

# =====================================
# =====================================
# =====================================
# =====================================

config_eval = yaml.safe_load(Path(YAML).read_text(encoding='utf-8'))
base_eval = Path(config_eval['path'])
split_eval = 'test' if config_eval.get('test') else 'val'
img_eval = base_eval / config_eval[split_eval]
# Estructura YOLO del notebook: images/<split> y labels/<split>.
lab_eval = base_eval / 'labels' / img_eval.name
assert img_eval.is_dir() and lab_eval.is_dir(), 'Revisa data.yaml y las carpetas de etiquetas'
names_eval = config_eval['names']
if isinstance(names_eval, list):
    names_eval = dict(enumerate(names_eval))
valores_id = {int(k): VALORES[str(v).lower().replace(' ', '')] for k,v in names_eval.items()}
archivos_eval = sorted(p for p in img_eval.rglob('*') if p.is_file() and p.suffix.lower() in EXTENSIONES)
assert archivos_eval, 'No hay imágenes etiquetadas para evaluar'
reales = {}
for foto in archivos_eval:
    etiqueta = (lab_eval / foto.relative_to(img_eval)).with_suffix('.txt')
    if not etiqueta.is_file():
        raise FileNotFoundError(f'Falta etiqueta: {etiqueta}')
    reales[str(foto.resolve())] = Counter(valores_id[int(l.split()[0])] for l in etiqueta.read_text().splitlines() if l.strip())

filas_eval = []
for pred in best_model.predict(source=[str(p) for p in archivos_eval],
        imgsz=IMGSZ, conf=CONF, device=DEVICE, batch=BATCH_PREDICCION,
        stream=True, verbose=False):
    ruta = str(Path(pred.path).resolve())
    real = reales[ruta]
    detectado = Counter(VALORES[str(best_model.names[int(b.cls.item())]).lower().replace(' ','')] for b in pred.boxes)
    total_real = sum(v*n for v,n in real.items())
    total_pred = sum(v*n for v,n in detectado.items())
    filas_eval.append({'Fotografía': str(Path(ruta).relative_to(img_eval.resolve())),
        'Total real': total_real, 'Total detectado': total_pred,
        'Monedas reales': sum(real.values()), 'Monedas detectadas': sum(detectado.values()),
        'Conteo por denominación correcto': real==detectado,
        **{f'Real ${v}':real[v] for v in [1,2,5,10]},
        **{f'Detectado ${v}':detectado[v] for v in [1,2,5,10]}})

df_error = pd.DataFrame(filas_eval)
assert len(df_error)==len(archivos_eval), 'Evaluación incompleta'
df_error['Error firmado (MXN)'] = df_error['Total detectado']-df_error['Total real']
df_error['Error absoluto (MXN)'] = df_error['Error firmado (MXN)'].abs()
e = df_error['Error firmado (MXN)']
metricas_dinero = pd.DataFrame([{
    'Conjunto': split_eval, 'Fotos': len(df_error),
    'MAE (MXN)': e.abs().mean(), 'RMSE (MXN)': np.sqrt((e**2).mean()),
    'Sesgo (MXN)': e.mean(), 'Error máximo (MXN)': e.abs().max(),
    'Importe exacto (%)': 100*e.eq(0).mean(),
    'Conteo exacto por denominación (%)': 100*df_error['Conteo por denominación correcto'].mean(),
    'MAE cantidad de monedas': (df_error['Monedas detectadas']-df_error['Monedas reales']).abs().mean()
}])
display(metricas_dinero.round(3))
df_error.to_csv(EVIDENCIAS / 'error_por_fotografia.csv', index=False)
metricas_dinero.to_csv(EVIDENCIAS / 'metricas_monetarias_dataset.csv', index=False)
df_error[df_error['Error absoluto (MXN)']>0].sort_values('Error absoluto (MXN)',ascending=False).to_csv(EVIDENCIAS / 'casos_de_error.csv',index=False)

fig, ax = plt.subplots(figsize=(11,4))
ax.bar(np.arange(1,len(df_error)+1), df_error['Error absoluto (MXN)'])
ax.set(title=f'Error absoluto por fotografía ({split_eval})', xlabel='Fotografía', ylabel='Error (MXN)')
guardar_grafica(fig,'error_absoluto.png')
fig, ax = plt.subplots(figsize=(8,4))
ax.hist(e, bins='auto', edgecolor='black'); ax.axvline(0, linestyle='--')
ax.set(title='Distribución del error monetario firmado', xlabel='Detectado − real (MXN)', ylabel='Fotografías')
guardar_grafica(fig,'distribucion_error.png')
fig, ax = plt.subplots(figsize=(7,6))
ax.scatter(df_error['Total real'],df_error['Total detectado'],alpha=.65)
lim = max(1,df_error[['Total real','Total detectado']].max().max())
ax.plot([0,lim],[0,lim],'--',label='Predicción perfecta'); ax.legend()
ax.set(title='Importe real frente al detectado', xlabel='Real (MXN)',ylabel='Detectado (MXN)')
guardar_grafica(fig,'real_vs_detectado.png')
por_denominacion = pd.DataFrame({'Real':[df_error[f'Real ${v}'].sum() for v in [1,2,5,10]],
    'Detectado':[df_error[f'Detectado ${v}'].sum() for v in [1,2,5,10]]},index=['$1','$2','$5','$10'])
fig,ax=plt.subplots(figsize=(8,5)); por_denominacion.plot.bar(ax=ax,rot=0)
ax.set(title='Conteo real vs detectado por denominación',ylabel='Cantidad de monedas')
guardar_grafica(fig,'comparacion_denominaciones.png')
fig,ax=plt.subplots(figsize=(6,4))
ax.bar(['Importe correcto','Importe incorrecto'],[int(e.eq(0).sum()),int(e.ne(0).sum())])
ax.set(title='Aciertos y errores del importe',ylabel='Fotografías')
guardar_grafica(fig,'aciertos_errores.png')
print('Conjunto evaluado:', split_eval, '| Confianza:', CONF)
print('Las etiquetas solo cubren las cuatro denominaciones conocidas.')

# =========================================
# =========== Celda 12. Comparar fotografías originales y limpias y empaquetar evidencias
# =========================================

# Ejecuta después de la celda 9 si ya tienes fotografías propias.
# Si no hay fotos, todavía se pueden empaquetar los resultados de las celdas 10 y 11.
if 'df_comparacion' in globals():
    comp = df_comparacion.copy()
    if 'Total original' in comp and 'Total limpio' in comp:
        comunes = comp.dropna(subset=['Total original','Total limpio']).copy()
        if len(comunes):
            fig,ax=plt.subplots(figsize=(max(8,len(comunes)*.6),5))
            columnas=['Total original','Total limpio']
            if comunes['Total real'].notna().any(): columnas.append('Total real')
            comunes[columnas].set_axis([f'Foto {i+1}' for i in range(len(comunes))]).plot.bar(ax=ax)
            ax.set(title='Importes: original frente a imagen limpia',ylabel='MXN')
            guardar_grafica(fig,'comparacion_original_limpia.png')
            pares = comunes.dropna(subset=['Total real']).copy()
            if len(pares):
                met=[]
                for col in ['Total original','Total limpio']:
                    error=pares[col]-pares['Total real']
                    pares['Error '+col]=error.abs()
                    met.append({'Método':col,'Fotos':len(error),'MAE (MXN)':error.abs().mean(),
                        'RMSE (MXN)':np.sqrt((error**2).mean()),'Sesgo (MXN)':error.mean(),
                        'Importes exactos (%)':100*error.eq(0).mean()})
                df_met=pd.DataFrame(met); display(df_met.round(3))
                df_met.to_csv(EVIDENCIAS/'metricas_original_limpia.csv',index=False)
                pares.to_csv(EVIDENCIAS/'errores_original_limpia.csv',index=False)
                fig,ax=plt.subplots(figsize=(max(8,len(pares)*.6),5))
                pares[['Error Total original','Error Total limpio']].set_axis([f'Foto {i+1}' for i in range(len(pares))]).plot.bar(ax=ax)
                ax.set(title='Error monetario: original frente a limpia',ylabel='Error absoluto (MXN)')
                guardar_grafica(fig,'error_original_limpia.png')
                fig,ax=plt.subplots(figsize=(7,4));df_met.set_index('Método')['Importes exactos (%)'].plot.bar(ax=ax,rot=0)
                ax.set(title='Exactitud monetaria por método',ylabel='Porcentaje',ylim=(0,105))
                guardar_grafica(fig,'exactitud_original_limpia.png')
            else:
                print('Completa TOTALES_REALES y repite la celda 9 para medir error real de ambas técnicas.')
        print('Fotos con ambos métodos:',len(comunes),'de',len(comp))
    comp.to_csv(EVIDENCIAS/'comparacion_fotografias.csv',index=False)
else:
    print('Sin comparación de fotos propias: ejecuta las celdas 7 a 9 cuando estén disponibles.')

# Copiar los reportes de las etapas anteriores sin incluir secretos ni datasets.
for ruta in Path(reporte_dir).glob('*.csv'):
    shutil.copy2(ruta,EVIDENCIAS/ruta.name)
archivo_zip=shutil.make_archive(str(Path(reporte_dir)/'VendIA_Evidencias_Vision'),'zip',root_dir=EVIDENCIAS)
print('Modelo:',DESTINO_PESOS)
print('Paquete de evidencias de visión:',archivo_zip)
print('Descarga ambos archivos desde JupyterLab antes de cerrar la sesión.')






