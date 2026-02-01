"""
Gerenciador de Leads - Smart Reforço
Aplicativo Desktop empacotado com PyWebView

Para executar:
    python main.py

Para gerar executável:
    pip install pyinstaller
    pyinstaller --onefile --windowed --icon=icon.ico --name="Gerenciador de Leads" main.py
"""

import webview
import threading
import sys
import os

# Adicionar o diretório atual ao path
if getattr(sys, 'frozen', False):
    # Executando como .exe
    BASE_DIR = os.path.dirname(sys.executable)
else:
    # Executando como script
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

os.chdir(BASE_DIR)
sys.path.insert(0, BASE_DIR)

# Importar app Flask
from app import app, init_db

# Configurações
PORT = 5000
DEBUG = False


def start_server():
    """Inicia o servidor Flask em uma thread separada"""
    # Inicializar banco de dados
    init_db()
    
    # Desativar logs do Flask em produção
    import logging
    log = logging.getLogger('werkzeug')
    log.setLevel(logging.ERROR)
    
    # Iniciar servidor
    app.run(
        host='127.0.0.1',
        port=PORT,
        debug=DEBUG,
        use_reloader=False,
        threaded=True
    )


def main():
    """Função principal - abre a janela do aplicativo"""
    
    # Iniciar servidor Flask em thread separada
    server_thread = threading.Thread(target=start_server)
    server_thread.daemon = True
    server_thread.start()
    
    # Aguardar servidor iniciar
    import time
    time.sleep(1)
    
    # Criar janela
    window = webview.create_window(
        title='Gerenciador de Leads - Smart Reforço',
        url=f'http://127.0.0.1:{PORT}',
        width=1400,
        height=900,
        resizable=True,
        min_size=(1024, 768),
        text_select=True,
        confirm_close=True
    )
    
    # Iniciar webview
    webview.start(
        debug=DEBUG,
        http_server=False
    )


if __name__ == '__main__':
    main()
