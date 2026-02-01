import sys
import os
import sqlite3
import pandas as pd
from datetime import datetime
from PyQt5.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QTableWidget, QTableWidgetItem, QPushButton, QLineEdit, QComboBox,
    QLabel, QTextEdit, QDialog, QFormLayout, QMessageBox, QProgressBar,
    QTabWidget, QFrame, QSplitter, QHeaderView, QFileDialog, QGroupBox,
    QScrollArea, QSizePolicy
)
from PyQt5.QtCore import Qt, QThread, pyqtSignal, QUrl
from PyQt5.QtGui import QFont, QColor, QIcon, QDesktopServices, QPalette

# Caminhos
if getattr(sys, 'frozen', False):
    # Executável PyInstaller
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'leads.db')
EXCEL_FOLDER = r"C:\Users\kaleb\Desktop\CONTATOS SMART REFORÇO"

# Estilos
STYLE = """
QMainWindow {
    background-color: #f0f2f5;
}
QTabWidget::pane {
    border: none;
    background-color: white;
    border-radius: 10px;
}
QTabBar::tab {
    background-color: #e0e0e0;
    padding: 10px 20px;
    margin-right: 2px;
    border-top-left-radius: 8px;
    border-top-right-radius: 8px;
    font-weight: bold;
}
QTabBar::tab:selected {
    background-color: #4f46e5;
    color: white;
}
QTableWidget {
    background-color: white;
    border: none;
    border-radius: 8px;
    gridline-color: #e5e7eb;
}
QTableWidget::item {
    padding: 8px;
}
QTableWidget::item:selected {
    background-color: #e0e7ff;
    color: black;
}
QHeaderView::section {
    background-color: #f8fafc;
    padding: 10px;
    border: none;
    border-bottom: 2px solid #e5e7eb;
    font-weight: bold;
    color: #374151;
}
QPushButton {
    background-color: #4f46e5;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 8px;
    font-weight: bold;
}
QPushButton:hover {
    background-color: #4338ca;
}
QPushButton:pressed {
    background-color: #3730a3;
}
QPushButton#whatsapp {
    background-color: #25d366;
}
QPushButton#whatsapp:hover {
    background-color: #128c7e;
}
QPushButton#danger {
    background-color: #ef4444;
}
QPushButton#danger:hover {
    background-color: #dc2626;
}
QPushButton#success {
    background-color: #10b981;
}
QPushButton#success:hover {
    background-color: #059669;
}
QPushButton#warning {
    background-color: #f59e0b;
}
QPushButton#warning:hover {
    background-color: #d97706;
}
QPushButton#secondary {
    background-color: #6b7280;
}
QPushButton#secondary:hover {
    background-color: #4b5563;
}
QLineEdit, QComboBox, QTextEdit {
    padding: 10px;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    background-color: white;
}
QLineEdit:focus, QComboBox:focus, QTextEdit:focus {
    border-color: #4f46e5;
}
QComboBox::drop-down {
    border: none;
    padding-right: 10px;
}
QLabel#title {
    font-size: 24px;
    font-weight: bold;
    color: #1f2937;
}
QLabel#subtitle {
    font-size: 14px;
    color: #6b7280;
}
QLabel#stat-number {
    font-size: 32px;
    font-weight: bold;
    color: #1f2937;
}
QLabel#stat-label {
    font-size: 12px;
    color: #6b7280;
}
QGroupBox {
    font-weight: bold;
    border: 2px solid #e5e7eb;
    border-radius: 10px;
    margin-top: 10px;
    padding-top: 10px;
    background-color: white;
}
QGroupBox::title {
    subcontrol-origin: margin;
    left: 15px;
    padding: 0 5px;
}
QFrame#stat-card {
    background-color: white;
    border-radius: 12px;
    padding: 20px;
}
QScrollArea {
    border: none;
    background-color: transparent;
}
"""

class ImportThread(QThread):
    progress = pyqtSignal(int, str)
    finished = pyqtSignal(int)
    
    def run(self):
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        total_importados = 0
        
        arquivos = [f for f in os.listdir(EXCEL_FOLDER) if f.endswith('.xlsx')]
        
        for i, arquivo in enumerate(arquivos):
            cidade = arquivo.replace('.xlsx', '')
            caminho = os.path.join(EXCEL_FOLDER, arquivo)
            
            self.progress.emit(int((i + 1) / len(arquivos) * 100), f"Importando: {cidade}")
            
            try:
                df = pd.read_excel(caminho)
                
                for _, row in df.iterrows():
                    nome = str(row.get('qBF1Pd', '')) if pd.notna(row.get('qBF1Pd')) else ''
                    telefone = str(row.get('UsdlK', '')) if pd.notna(row.get('UsdlK')) else ''
                    endereco = str(row.get('W4Efsd 3', '')) if pd.notna(row.get('W4Efsd 3')) else ''
                    tipo_servico = str(row.get('W4Efsd', '')) if pd.notna(row.get('W4Efsd')) else ''
                    avaliacao = str(row.get('MW4etd', '')) if pd.notna(row.get('MW4etd')) else ''
                    link_maps = str(row.get('hfpxzc href', '')) if pd.notna(row.get('hfpxzc href')) else ''
                    
                    if telefone and telefone != 'nan':
                        try:
                            cursor.execute('''
                                INSERT OR IGNORE INTO leads 
                                (nome, telefone, endereco, cidade, tipo_servico, avaliacao, link_maps)
                                VALUES (?, ?, ?, ?, ?, ?, ?)
                            ''', (nome, telefone, endereco, cidade, tipo_servico, avaliacao, link_maps))
                            total_importados += cursor.rowcount
                        except:
                            pass
            except Exception as e:
                print(f"Erro ao importar {arquivo}: {e}")
        
        conn.commit()
        conn.close()
        self.finished.emit(total_importados)


class LeadDetailDialog(QDialog):
    def __init__(self, lead_id, parent=None):
        super().__init__(parent)
        self.lead_id = lead_id
        self.setWindowTitle("Detalhes do Lead")
        self.setMinimumSize(700, 600)
        self.setup_ui()
        self.load_data()
    
    def setup_ui(self):
        layout = QVBoxLayout(self)
        layout.setSpacing(15)
        
        # Info do Lead
        info_group = QGroupBox("Informações do Lead")
        info_layout = QFormLayout(info_group)
        
        self.lbl_nome = QLabel()
        self.lbl_nome.setFont(QFont("Segoe UI", 14, QFont.Bold))
        info_layout.addRow("Nome:", self.lbl_nome)
        
        telefone_layout = QHBoxLayout()
        self.lbl_telefone = QLabel()
        telefone_layout.addWidget(self.lbl_telefone)
        
        self.btn_whatsapp = QPushButton("📱 WhatsApp")
        self.btn_whatsapp.setObjectName("whatsapp")
        self.btn_whatsapp.clicked.connect(self.abrir_whatsapp)
        telefone_layout.addWidget(self.btn_whatsapp)
        telefone_layout.addStretch()
        
        info_layout.addRow("Telefone:", telefone_layout)
        
        self.lbl_cidade = QLabel()
        info_layout.addRow("Cidade:", self.lbl_cidade)
        
        self.lbl_endereco = QLabel()
        self.lbl_endereco.setWordWrap(True)
        info_layout.addRow("Endereço:", self.lbl_endereco)
        
        self.lbl_tipo = QLabel()
        info_layout.addRow("Tipo:", self.lbl_tipo)
        
        self.lbl_avaliacao = QLabel()
        info_layout.addRow("Avaliação:", self.lbl_avaliacao)
        
        self.btn_maps = QPushButton("🗺️ Abrir no Google Maps")
        self.btn_maps.setObjectName("secondary")
        self.btn_maps.clicked.connect(self.abrir_maps)
        info_layout.addRow("", self.btn_maps)
        
        layout.addWidget(info_group)
        
        # Status
        status_group = QGroupBox("Status do Lead")
        status_layout = QHBoxLayout(status_group)
        
        self.combo_status = QComboBox()
        self.combo_status.addItems(["novo", "em_contato", "convertido", "perdido"])
        status_layout.addWidget(QLabel("Status:"))
        status_layout.addWidget(self.combo_status)
        
        self.btn_salvar_status = QPushButton("💾 Salvar Status")
        self.btn_salvar_status.clicked.connect(self.salvar_status)
        status_layout.addWidget(self.btn_salvar_status)
        status_layout.addStretch()
        
        layout.addWidget(status_group)
        
        # Anotações
        anot_group = QGroupBox("Anotações")
        anot_layout = QVBoxLayout(anot_group)
        
        self.txt_nova_anotacao = QTextEdit()
        self.txt_nova_anotacao.setMaximumHeight(80)
        self.txt_nova_anotacao.setPlaceholderText("Digite uma anotação...")
        anot_layout.addWidget(self.txt_nova_anotacao)
        
        self.btn_add_anotacao = QPushButton("➕ Adicionar Anotação")
        self.btn_add_anotacao.clicked.connect(self.adicionar_anotacao)
        anot_layout.addWidget(self.btn_add_anotacao)
        
        self.lista_anotacoes = QTextEdit()
        self.lista_anotacoes.setReadOnly(True)
        anot_layout.addWidget(self.lista_anotacoes)
        
        layout.addWidget(anot_group)
    
    def load_data(self):
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute('SELECT * FROM leads WHERE id = ?', (self.lead_id,))
        row = cursor.fetchone()
        
        if row:
            self.lbl_nome.setText(row[1] or "Sem nome")
            self.lbl_telefone.setText(row[2] or "")
            self.telefone = row[2]
            self.lbl_endereco.setText(row[3] or "Não informado")
            self.lbl_cidade.setText(row[4] or "")
            self.lbl_tipo.setText(row[5] or "")
            self.lbl_avaliacao.setText(row[6] or "")
            self.link_maps = row[7] or ""
            
            status = row[8] or "novo"
            index = self.combo_status.findText(status)
            if index >= 0:
                self.combo_status.setCurrentIndex(index)
        
        # Carregar anotações
        cursor.execute('SELECT texto, created_at FROM anotacoes WHERE lead_id = ? ORDER BY created_at DESC', (self.lead_id,))
        anotacoes = cursor.fetchall()
        
        texto_anotacoes = ""
        for anot in anotacoes:
            texto_anotacoes += f"📝 {anot[1]}\n{anot[0]}\n{'─'*40}\n"
        
        self.lista_anotacoes.setText(texto_anotacoes or "Nenhuma anotação")
        
        conn.close()
    
    def abrir_whatsapp(self):
        if hasattr(self, 'telefone') and self.telefone:
            url = f"https://wa.me/{self.telefone}"
            QDesktopServices.openUrl(QUrl(url))
    
    def abrir_maps(self):
        if hasattr(self, 'link_maps') and self.link_maps:
            QDesktopServices.openUrl(QUrl(self.link_maps))
    
    def salvar_status(self):
        novo_status = self.combo_status.currentText()
        
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute('UPDATE leads SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                      (novo_status, self.lead_id))
        
        cursor.execute('INSERT INTO historico (lead_id, acao, descricao) VALUES (?, ?, ?)',
                      (self.lead_id, 'status_change', f'Status alterado para "{novo_status}"'))
        
        conn.commit()
        conn.close()
        
        QMessageBox.information(self, "Sucesso", "Status atualizado!")
    
    def adicionar_anotacao(self):
        texto = self.txt_nova_anotacao.toPlainText().strip()
        if not texto:
            return
        
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute('INSERT INTO anotacoes (lead_id, texto) VALUES (?, ?)',
                      (self.lead_id, texto))
        
        conn.commit()
        conn.close()
        
        self.txt_nova_anotacao.clear()
        self.load_data()


class StatCard(QFrame):
    def __init__(self, title, value, color="#4f46e5"):
        super().__init__()
        self.setObjectName("stat-card")
        self.setStyleSheet(f"""
            QFrame#stat-card {{
                background-color: white;
                border-radius: 12px;
                border-left: 4px solid {color};
            }}
        """)
        
        layout = QVBoxLayout(self)
        layout.setContentsMargins(20, 15, 20, 15)
        
        self.lbl_value = QLabel(str(value))
        self.lbl_value.setObjectName("stat-number")
        self.lbl_value.setStyleSheet(f"color: {color}; font-size: 28px; font-weight: bold;")
        layout.addWidget(self.lbl_value)
        
        lbl_title = QLabel(title)
        lbl_title.setObjectName("stat-label")
        layout.addWidget(lbl_title)
    
    def set_value(self, value):
        self.lbl_value.setText(str(value))


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Gerenciador de Leads - Smart Reforço")
        self.setMinimumSize(1200, 800)
        self.init_db()
        self.setup_ui()
        self.load_stats()
        self.load_cidades()
        self.load_leads()
    
    def init_db(self):
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS leads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT,
                telefone TEXT UNIQUE,
                endereco TEXT,
                cidade TEXT,
                tipo_servico TEXT,
                avaliacao TEXT,
                link_maps TEXT,
                status TEXT DEFAULT 'novo',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS anotacoes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lead_id INTEGER,
                texto TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (lead_id) REFERENCES leads (id)
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS historico (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lead_id INTEGER,
                acao TEXT,
                descricao TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (lead_id) REFERENCES leads (id)
            )
        ''')
        
        conn.commit()
        conn.close()
    
    def setup_ui(self):
        central = QWidget()
        self.setCentralWidget(central)
        main_layout = QVBoxLayout(central)
        main_layout.setContentsMargins(20, 20, 20, 20)
        main_layout.setSpacing(15)
        
        # Título
        title_layout = QHBoxLayout()
        title = QLabel("📊 Gerenciador de Leads")
        title.setObjectName("title")
        title.setStyleSheet("font-size: 24px; font-weight: bold; color: #1f2937;")
        title_layout.addWidget(title)
        title_layout.addStretch()
        main_layout.addLayout(title_layout)
        
        # Tabs
        self.tabs = QTabWidget()
        main_layout.addWidget(self.tabs)
        
        # Tab Dashboard
        self.setup_dashboard_tab()
        
        # Tab Leads
        self.setup_leads_tab()
        
        # Tab Importar
        self.setup_import_tab()
    
    def setup_dashboard_tab(self):
        tab = QWidget()
        layout = QVBoxLayout(tab)
        layout.setSpacing(20)
        
        # Cards de estatísticas
        stats_layout = QHBoxLayout()
        
        self.card_total = StatCard("Total de Leads", 0, "#4f46e5")
        stats_layout.addWidget(self.card_total)
        
        self.card_novo = StatCard("Novos", 0, "#3b82f6")
        stats_layout.addWidget(self.card_novo)
        
        self.card_contato = StatCard("Em Contato", 0, "#f59e0b")
        stats_layout.addWidget(self.card_contato)
        
        self.card_convertido = StatCard("Convertidos", 0, "#10b981")
        stats_layout.addWidget(self.card_convertido)
        
        self.card_perdido = StatCard("Perdidos", 0, "#ef4444")
        stats_layout.addWidget(self.card_perdido)
        
        layout.addLayout(stats_layout)
        
        # Top Cidades
        cidades_group = QGroupBox("🏙️ Top 10 Cidades")
        cidades_layout = QVBoxLayout(cidades_group)
        
        self.table_cidades = QTableWidget()
        self.table_cidades.setColumnCount(2)
        self.table_cidades.setHorizontalHeaderLabels(["Cidade", "Leads"])
        self.table_cidades.horizontalHeader().setStretchLastSection(True)
        self.table_cidades.horizontalHeader().setSectionResizeMode(0, QHeaderView.Stretch)
        self.table_cidades.setMaximumHeight(300)
        cidades_layout.addWidget(self.table_cidades)
        
        layout.addWidget(cidades_group)
        
        # Botão atualizar
        btn_refresh = QPushButton("🔄 Atualizar Dashboard")
        btn_refresh.clicked.connect(self.load_stats)
        layout.addWidget(btn_refresh)
        
        layout.addStretch()
        
        self.tabs.addTab(tab, "📊 Dashboard")
    
    def setup_leads_tab(self):
        tab = QWidget()
        layout = QVBoxLayout(tab)
        layout.setSpacing(15)
        
        # Filtros
        filter_layout = QHBoxLayout()
        
        self.search_input = QLineEdit()
        self.search_input.setPlaceholderText("🔍 Buscar por nome, telefone ou endereço...")
        self.search_input.textChanged.connect(self.load_leads)
        filter_layout.addWidget(self.search_input, 2)
        
        self.combo_cidade = QComboBox()
        self.combo_cidade.addItem("Todas as Cidades")
        self.combo_cidade.currentTextChanged.connect(self.load_leads)
        filter_layout.addWidget(self.combo_cidade)
        
        self.combo_status = QComboBox()
        self.combo_status.addItems(["Todos os Status", "novo", "em_contato", "convertido", "perdido"])
        self.combo_status.currentTextChanged.connect(self.load_leads)
        filter_layout.addWidget(self.combo_status)
        
        btn_limpar = QPushButton("🗑️ Limpar")
        btn_limpar.setObjectName("secondary")
        btn_limpar.clicked.connect(self.limpar_filtros)
        filter_layout.addWidget(btn_limpar)
        
        layout.addLayout(filter_layout)
        
        # Label de contagem
        self.lbl_count = QLabel("0 leads encontrados")
        self.lbl_count.setStyleSheet("color: #6b7280; font-size: 12px;")
        layout.addWidget(self.lbl_count)
        
        # Tabela de leads
        self.table_leads = QTableWidget()
        self.table_leads.setColumnCount(6)
        self.table_leads.setHorizontalHeaderLabels(["Nome", "Telefone", "Cidade", "Status", "WhatsApp", "Detalhes"])
        self.table_leads.horizontalHeader().setSectionResizeMode(0, QHeaderView.Stretch)
        self.table_leads.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeToContents)
        self.table_leads.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeToContents)
        self.table_leads.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeToContents)
        self.table_leads.horizontalHeader().setSectionResizeMode(4, QHeaderView.ResizeToContents)
        self.table_leads.horizontalHeader().setSectionResizeMode(5, QHeaderView.ResizeToContents)
        self.table_leads.setSelectionBehavior(QTableWidget.SelectRows)
        self.table_leads.setAlternatingRowColors(True)
        self.table_leads.doubleClicked.connect(self.abrir_lead)
        layout.addWidget(self.table_leads)
        
        # Paginação
        pag_layout = QHBoxLayout()
        
        self.btn_prev = QPushButton("◀ Anterior")
        self.btn_prev.setObjectName("secondary")
        self.btn_prev.clicked.connect(self.pagina_anterior)
        pag_layout.addWidget(self.btn_prev)
        
        pag_layout.addStretch()
        
        self.lbl_pagina = QLabel("Página 1")
        pag_layout.addWidget(self.lbl_pagina)
        
        pag_layout.addStretch()
        
        self.btn_next = QPushButton("Próximo ▶")
        self.btn_next.setObjectName("secondary")
        self.btn_next.clicked.connect(self.proxima_pagina)
        pag_layout.addWidget(self.btn_next)
        
        layout.addLayout(pag_layout)
        
        # Exportar
        btn_exportar = QPushButton("📥 Exportar para CSV")
        btn_exportar.clicked.connect(self.exportar_csv)
        layout.addWidget(btn_exportar)
        
        self.current_page = 1
        self.per_page = 50
        
        self.tabs.addTab(tab, "👥 Leads")
    
    def setup_import_tab(self):
        tab = QWidget()
        layout = QVBoxLayout(tab)
        layout.setAlignment(Qt.AlignCenter)
        
        icon = QLabel("📁")
        icon.setStyleSheet("font-size: 80px;")
        icon.setAlignment(Qt.AlignCenter)
        layout.addWidget(icon)
        
        title = QLabel("Importar Dados dos Arquivos Excel")
        title.setStyleSheet("font-size: 20px; font-weight: bold; color: #1f2937;")
        title.setAlignment(Qt.AlignCenter)
        layout.addWidget(title)
        
        desc = QLabel(f"Pasta: {EXCEL_FOLDER}")
        desc.setStyleSheet("color: #6b7280;")
        desc.setAlignment(Qt.AlignCenter)
        layout.addWidget(desc)
        
        layout.addSpacing(20)
        
        self.progress_bar = QProgressBar()
        self.progress_bar.setVisible(False)
        self.progress_bar.setMinimumWidth(400)
        layout.addWidget(self.progress_bar)
        
        self.lbl_progress = QLabel("")
        self.lbl_progress.setAlignment(Qt.AlignCenter)
        layout.addWidget(self.lbl_progress)
        
        layout.addSpacing(20)
        
        self.btn_importar = QPushButton("📥 Importar Dados")
        self.btn_importar.setMinimumWidth(200)
        self.btn_importar.clicked.connect(self.iniciar_importacao)
        layout.addWidget(self.btn_importar)
        
        layout.addStretch()
        
        self.tabs.addTab(tab, "📥 Importar")
    
    def load_stats(self):
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute('SELECT COUNT(*) FROM leads')
        total = cursor.fetchone()[0]
        self.card_total.set_value(total)
        
        cursor.execute('SELECT status, COUNT(*) FROM leads GROUP BY status')
        status_counts = dict(cursor.fetchall())
        
        self.card_novo.set_value(status_counts.get('novo', 0))
        self.card_contato.set_value(status_counts.get('em_contato', 0))
        self.card_convertido.set_value(status_counts.get('convertido', 0))
        self.card_perdido.set_value(status_counts.get('perdido', 0))
        
        # Top cidades
        cursor.execute('SELECT cidade, COUNT(*) as count FROM leads GROUP BY cidade ORDER BY count DESC LIMIT 10')
        cidades = cursor.fetchall()
        
        self.table_cidades.setRowCount(len(cidades))
        for i, (cidade, count) in enumerate(cidades):
            self.table_cidades.setItem(i, 0, QTableWidgetItem(cidade))
            self.table_cidades.setItem(i, 1, QTableWidgetItem(str(count)))
        
        conn.close()
    
    def load_cidades(self):
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute('SELECT DISTINCT cidade FROM leads ORDER BY cidade')
        cidades = cursor.fetchall()
        
        self.combo_cidade.clear()
        self.combo_cidade.addItem("Todas as Cidades")
        for (cidade,) in cidades:
            self.combo_cidade.addItem(cidade)
        
        conn.close()
    
    def load_leads(self):
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        search = self.search_input.text()
        cidade = self.combo_cidade.currentText()
        status = self.combo_status.currentText()
        
        query = 'SELECT id, nome, telefone, cidade, status FROM leads WHERE 1=1'
        params = []
        
        if search:
            query += ' AND (nome LIKE ? OR telefone LIKE ? OR endereco LIKE ?)'
            search_param = f'%{search}%'
            params.extend([search_param, search_param, search_param])
        
        if cidade and cidade != "Todas as Cidades":
            query += ' AND cidade = ?'
            params.append(cidade)
        
        if status and status != "Todos os Status":
            query += ' AND status = ?'
            params.append(status)
        
        # Contar total
        count_query = query.replace('SELECT id, nome, telefone, cidade, status', 'SELECT COUNT(*)')
        cursor.execute(count_query, params)
        total = cursor.fetchone()[0]
        
        self.lbl_count.setText(f"{total} leads encontrados")
        
        # Buscar com paginação
        offset = (self.current_page - 1) * self.per_page
        query += f' ORDER BY updated_at DESC LIMIT {self.per_page} OFFSET {offset}'
        
        cursor.execute(query, params)
        leads = cursor.fetchall()
        
        total_pages = (total + self.per_page - 1) // self.per_page
        self.lbl_pagina.setText(f"Página {self.current_page} de {max(1, total_pages)}")
        
        self.table_leads.setRowCount(len(leads))
        
        status_colors = {
            'novo': '#3b82f6',
            'em_contato': '#f59e0b',
            'convertido': '#10b981',
            'perdido': '#ef4444'
        }
        
        for i, (lead_id, nome, telefone, cidade, status) in enumerate(leads):
            self.table_leads.setItem(i, 0, QTableWidgetItem(nome or "Sem nome"))
            self.table_leads.setItem(i, 1, QTableWidgetItem(telefone or ""))
            self.table_leads.setItem(i, 2, QTableWidgetItem(cidade or ""))
            
            status_item = QTableWidgetItem(status or "novo")
            status_item.setForeground(QColor(status_colors.get(status, '#6b7280')))
            self.table_leads.setItem(i, 3, status_item)
            
            # Botão WhatsApp
            btn_whats = QPushButton("📱")
            btn_whats.setObjectName("whatsapp")
            btn_whats.setMaximumWidth(50)
            btn_whats.clicked.connect(lambda checked, t=telefone: self.abrir_whatsapp(t))
            self.table_leads.setCellWidget(i, 4, btn_whats)
            
            # Botão Detalhes
            btn_detail = QPushButton("👁️")
            btn_detail.setMaximumWidth(50)
            btn_detail.clicked.connect(lambda checked, lid=lead_id: self.abrir_detalhes(lid))
            self.table_leads.setCellWidget(i, 5, btn_detail)
        
        conn.close()
    
    def limpar_filtros(self):
        self.search_input.clear()
        self.combo_cidade.setCurrentIndex(0)
        self.combo_status.setCurrentIndex(0)
        self.current_page = 1
        self.load_leads()
    
    def pagina_anterior(self):
        if self.current_page > 1:
            self.current_page -= 1
            self.load_leads()
    
    def proxima_pagina(self):
        self.current_page += 1
        self.load_leads()
    
    def abrir_whatsapp(self, telefone):
        if telefone:
            url = f"https://wa.me/{telefone}"
            QDesktopServices.openUrl(QUrl(url))
    
    def abrir_detalhes(self, lead_id):
        dialog = LeadDetailDialog(lead_id, self)
        dialog.exec_()
        self.load_leads()
        self.load_stats()
    
    def abrir_lead(self, index):
        row = index.row()
        lead_id_item = self.table_leads.item(row, 0)
        
        # Buscar ID pelo telefone
        telefone = self.table_leads.item(row, 1).text()
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM leads WHERE telefone = ?', (telefone,))
        result = cursor.fetchone()
        conn.close()
        
        if result:
            self.abrir_detalhes(result[0])
    
    def iniciar_importacao(self):
        self.btn_importar.setEnabled(False)
        self.progress_bar.setVisible(True)
        self.progress_bar.setValue(0)
        
        self.import_thread = ImportThread()
        self.import_thread.progress.connect(self.atualizar_progresso)
        self.import_thread.finished.connect(self.importacao_concluida)
        self.import_thread.start()
    
    def atualizar_progresso(self, valor, texto):
        self.progress_bar.setValue(valor)
        self.lbl_progress.setText(texto)
    
    def importacao_concluida(self, total):
        self.btn_importar.setEnabled(True)
        self.progress_bar.setValue(100)
        self.lbl_progress.setText(f"✅ Importação concluída! {total} novos leads importados.")
        
        QMessageBox.information(self, "Importação Concluída", 
                              f"Foram importados {total} novos leads!")
        
        self.load_stats()
        self.load_cidades()
        self.load_leads()
    
    def exportar_csv(self):
        filename, _ = QFileDialog.getSaveFileName(self, "Salvar CSV", 
                                                   "leads_exportados.csv", 
                                                   "CSV Files (*.csv)")
        if filename:
            conn = sqlite3.connect(DB_PATH)
            
            search = self.search_input.text()
            cidade = self.combo_cidade.currentText()
            status = self.combo_status.currentText()
            
            query = 'SELECT * FROM leads WHERE 1=1'
            params = []
            
            if search:
                query += ' AND (nome LIKE ? OR telefone LIKE ? OR endereco LIKE ?)'
                search_param = f'%{search}%'
                params.extend([search_param, search_param, search_param])
            
            if cidade and cidade != "Todas as Cidades":
                query += ' AND cidade = ?'
                params.append(cidade)
            
            if status and status != "Todos os Status":
                query += ' AND status = ?'
                params.append(status)
            
            df = pd.read_sql_query(query, conn, params=params)
            df.to_csv(filename, index=False, encoding='utf-8-sig')
            conn.close()
            
            QMessageBox.information(self, "Exportação", 
                                  f"Leads exportados para:\n{filename}")


def main():
    app = QApplication(sys.argv)
    app.setStyle('Fusion')
    app.setStyleSheet(STYLE)
    
    # Definir fonte padrão
    font = QFont("Segoe UI", 10)
    app.setFont(font)
    
    window = MainWindow()
    window.show()
    
    sys.exit(app.exec_())


if __name__ == '__main__':
    main()
