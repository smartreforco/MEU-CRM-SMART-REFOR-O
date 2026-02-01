"""
Script para importar leads das planilhas Excel para Supabase
Exclui números das listas 10 e 11 (já usados no marketing)
"""

import pandas as pd
import os
import re
from supabase import create_client

# Configuração Supabase
SUPABASE_URL = 'https://dcieravtcvoprktjgvry.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjaWVyYXZ0Y3ZvcHJrdGpndnJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2NTY5ODMsImV4cCI6MjA4NTIzMjk4M30.vvCrJG8oPcZUcjgfL9vVXFNto5dW1z6hSNvKCa5dgec'

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Pastas
PASTA_CONTATOS = r'C:\Users\kaleb\Desktop\CONTATOS SMART REFORÇO'
PASTA_LISTAS = r'C:\Users\kaleb\Desktop\extraçãocontatos'

def normalizar_telefone(telefone):
    """Normaliza telefone para comparação (últimos 11 dígitos)"""
    if not telefone:
        return None
    num_limpo = ''.join(filter(str.isdigit, str(telefone)))
    if len(num_limpo) >= 10:
        return num_limpo[-11:]  # Últimos 11 dígitos (com DDD)
    return None

def extrair_cidade_do_arquivo(nome_arquivo):
    """Extrai cidade do nome do arquivo"""
    # Remove extensão e limpa
    cidade = os.path.splitext(nome_arquivo)[0]
    # Remove estado se tiver
    cidade = re.sub(r'-[A-Z]{2}$', '', cidade).strip()
    return cidade

def carregar_numeros_usados():
    """Carrega números das listas 10 e 11"""
    numeros = set()
    for lista in ['lista_10.csv', 'lista_11.csv']:
        caminho = os.path.join(PASTA_LISTAS, lista)
        if os.path.exists(caminho):
            with open(caminho, 'r') as f:
                for line in f:
                    num = line.strip()
                    if num and num != 'numero':
                        num_norm = normalizar_telefone(num)
                        if num_norm:
                            numeros.add(num_norm)
    return numeros

def processar_planilha(caminho_arquivo, cidade, numeros_usados):
    """Processa uma planilha e retorna leads válidos"""
    leads = []
    
    try:
        df = pd.read_excel(caminho_arquivo)
        
        # Mapeamento de colunas
        col_nome = 'qBF1Pd'
        col_telefone = 'UsdlK'
        col_endereco = 'W4Efsd 3'
        col_avaliacao = 'MW4etd'
        col_tipo = 'W4Efsd'
        
        for _, row in df.iterrows():
            telefone_raw = row.get(col_telefone)
            if pd.isna(telefone_raw):
                continue
                
            telefone_norm = normalizar_telefone(telefone_raw)
            if not telefone_norm:
                continue
            
            # Verificar se já foi usado
            if telefone_norm in numeros_usados:
                continue
            
            nome = row.get(col_nome)
            if pd.isna(nome) or not str(nome).strip():
                continue
            
            lead = {
                'nome': str(nome).strip()[:200],
                'telefone': telefone_norm,
                'cidade': cidade,
                'origem': 'Google Maps',
                'status': 'novo',
                'prioridade': 'media',
                'whatsapp_status': 'pendente',
                'observacoes': None
            }
            
            # Endereço
            endereco = row.get(col_endereco)
            if pd.notna(endereco):
                lead['observacoes'] = f"Endereço: {str(endereco).strip()[:200]}"
            
            # Tipo de serviço
            tipo = row.get(col_tipo)
            if pd.notna(tipo) and str(tipo).strip():
                lead['interesse'] = str(tipo).strip()[:100]
            
            leads.append(lead)
            
    except Exception as e:
        print(f"  ❌ Erro ao processar: {e}")
    
    return leads

def main():
    print("=" * 60)
    print("IMPORTAÇÃO DE LEADS PARA SUPABASE")
    print("=" * 60)
    
    # 1. Carregar números já usados
    print("\n📋 Carregando números das listas 10 e 11 (já usados)...")
    numeros_usados = carregar_numeros_usados()
    print(f"   → {len(numeros_usados)} números a excluir")
    
    # 2. Listar planilhas
    arquivos = [f for f in os.listdir(PASTA_CONTATOS) if f.endswith('.xlsx')]
    print(f"\n📂 Encontradas {len(arquivos)} planilhas")
    
    # 3. Processar cada planilha
    todos_leads = []
    telefones_unicos = set()  # Para evitar duplicatas
    
    for arquivo in arquivos:
        caminho = os.path.join(PASTA_CONTATOS, arquivo)
        cidade = extrair_cidade_do_arquivo(arquivo)
        
        print(f"\n📍 Processando: {cidade}...")
        leads = processar_planilha(caminho, cidade, numeros_usados)
        
        # Filtrar duplicatas
        leads_novos = []
        for lead in leads:
            if lead['telefone'] not in telefones_unicos:
                telefones_unicos.add(lead['telefone'])
                leads_novos.append(lead)
        
        print(f"   → {len(leads_novos)} leads válidos (após filtros)")
        todos_leads.extend(leads_novos)
    
    print(f"\n{'='*60}")
    print(f"📊 TOTAL: {len(todos_leads)} leads para importar")
    print(f"{'='*60}")
    
    if not todos_leads:
        print("❌ Nenhum lead para importar!")
        return
    
    # 4. Importar para Supabase em lotes
    print("\n⬆️ Enviando para Supabase...")
    
    batch_size = 100
    total_importados = 0
    
    for i in range(0, len(todos_leads), batch_size):
        batch = todos_leads[i:i+batch_size]
        try:
            result = supabase.table('leads').insert(batch).execute()
            total_importados += len(batch)
            print(f"   ✅ Lote {i//batch_size + 1}: {len(batch)} leads importados")
        except Exception as e:
            print(f"   ❌ Erro no lote {i//batch_size + 1}: {e}")
    
    print(f"\n{'='*60}")
    print(f"✅ CONCLUÍDO: {total_importados} leads importados com sucesso!")
    print(f"{'='*60}")

if __name__ == '__main__':
    main()
