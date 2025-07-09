const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
  constructor() {
    // Criar pasta de dados se não existir
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir);
    }
    
    this.dbPath = path.join(dataDir, 'agenda.db');
    this.db = new sqlite3.Database(this.dbPath);
    this.init();
  }

  init() {
    this.db.serialize(() => {
      // Tabela de funcionários
      this.db.run(`CREATE TABLE IF NOT EXISTS funcionarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        diaria REAL NOT NULL,
        ativo INTEGER DEFAULT 1,
        data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Tabela de dias trabalhados
      this.db.run(`CREATE TABLE IF NOT EXISTS dias_trabalho (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id INTEGER,
        data DATE NOT NULL,
        trabalhou INTEGER DEFAULT 1,
        observacoes TEXT,
        data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios (id)
      )`);

      // Tabela de configurações (apenas diária do veículo)
      this.db.run(`CREATE TABLE IF NOT EXISTS configuracoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chave TEXT UNIQUE NOT NULL,
        valor TEXT NOT NULL,
        descricao TEXT
      )`);

      // Tabela de histórico mensal para totais
      this.db.run(`CREATE TABLE IF NOT EXISTS historico_mensal (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ano INTEGER NOT NULL,
        mes INTEGER NOT NULL,
        total_funcionarios REAL DEFAULT 0,
        total_veiculo REAL DEFAULT 0,
        dias_trabalhados INTEGER DEFAULT 0,
        total_geral REAL DEFAULT 0,
        data_calculo DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(ano, mes)
      )`);

      // Tabela de comprovantes de pagamento
      this.db.run(`CREATE TABLE IF NOT EXISTS comprovantes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id INTEGER,
        periodo_inicio DATE NOT NULL,
        periodo_fim DATE NOT NULL,
        valor_total REAL NOT NULL,
        arquivo_comprovante TEXT,
        observacoes TEXT,
        data_pagamento DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (funcionario_id) REFERENCES funcionarios (id)
      )`);

      // Adicionar coluna observacoes se não existir (para bancos antigos)
      this.db.run(`ALTER TABLE comprovantes ADD COLUMN observacoes TEXT`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
          console.log('Coluna observacoes já existe ou outro erro:', err.message);
        }
      });

      // Tabela de relatórios gerados
      // Tabela de relatórios reformulada para salvar dados em vez de arquivos
      this.db.run(`CREATE TABLE IF NOT EXISTS relatorios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT NOT NULL,
        data_inicio DATE NOT NULL,
        data_fim DATE NOT NULL,
        nome_relatorio TEXT NOT NULL,
        dados_relatorio TEXT NOT NULL, -- JSON com os dados do relatório
        total_funcionarios REAL DEFAULT 0,
        total_veiculo REAL DEFAULT 0,
        total_geral REAL DEFAULT 0,
        dias_trabalhados INTEGER DEFAULT 0,
        data_geracao DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Inserir configurações padrão se não existirem (removendo diaria_pai)
      this.db.run(`INSERT OR IGNORE INTO configuracoes (chave, valor, descricao) VALUES 
        ('diaria_veiculo', '50.00', 'Valor da diária do veículo')
      `);
    });
  }

  // Métodos para funcionários
  adicionarFuncionario(nome, diaria) {
    return new Promise((resolve, reject) => {
      this.db.run("INSERT INTO funcionarios (nome, diaria) VALUES (?, ?)", [nome, diaria], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  obterFuncionarios() {
    return new Promise((resolve, reject) => {
      this.db.all("SELECT * FROM funcionarios WHERE ativo = 1 ORDER BY nome", (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  atualizarFuncionario(id, nome, diaria) {
    return new Promise((resolve, reject) => {
      this.db.run("UPDATE funcionarios SET nome = ?, diaria = ? WHERE id = ?", [nome, diaria, id], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  excluirFuncionario(id) {
    return new Promise((resolve, reject) => {
      this.db.run("UPDATE funcionarios SET ativo = 0 WHERE id = ?", [id], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  // Métodos para dias de trabalho
  marcarDiaTrabalho(funcionarioId, data, trabalhou = true, observacoes = '') {
    return new Promise((resolve, reject) => {
      if (trabalhou) {
        // Se está marcando para trabalhar, inserir/atualizar registro
        this.db.run(`INSERT OR REPLACE INTO dias_trabalho 
          (funcionario_id, data, trabalhou, observacoes) VALUES (?, ?, 1, ?)`, 
          [funcionarioId, data, observacoes], function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        });
      } else {
        // Se está desmarcando, DELETAR o registro completamente
        this.db.run(`DELETE FROM dias_trabalho 
          WHERE funcionario_id = ? AND data = ?`, 
          [funcionarioId, data], function(err) {
          if (err) reject(err);
          else resolve(this.changes); // Retorna número de linhas afetadas
        });
      }
    });
  }

  obterDiasTrabalho(dataInicio, dataFim) {
    return new Promise((resolve, reject) => {
      this.db.all(`SELECT dt.*, f.nome, f.diaria 
        FROM dias_trabalho dt 
        JOIN funcionarios f ON dt.funcionario_id = f.id 
        WHERE dt.data BETWEEN ? AND ? AND dt.trabalhou = 1
        ORDER BY dt.data, f.nome`, 
        [dataInicio, dataFim], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  obterDiasPorFuncionario(funcionarioId, dataInicio, dataFim) {
    return new Promise((resolve, reject) => {
      this.db.all(`SELECT * FROM dias_trabalho 
        WHERE funcionario_id = ? AND data BETWEEN ? AND ? AND trabalhou = 1
        ORDER BY data`, 
        [funcionarioId, dataInicio, dataFim], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Métodos para configurações
  obterConfiguracao(chave) {
    return new Promise((resolve, reject) => {
      this.db.get("SELECT valor FROM configuracoes WHERE chave = ?", [chave], (err, row) => {
        if (err) reject(err);
        else resolve(row ? parseFloat(row.valor) : 0);
      });
    });
  }

  atualizarConfiguracao(chave, valor) {
    return new Promise((resolve, reject) => {
      this.db.run("UPDATE configuracoes SET valor = ? WHERE chave = ?", [valor.toString(), chave], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  // Métodos para comprovantes
  adicionarComprovante(funcionarioId, periodoInicio, periodoFim, valorTotal, arquivoComprovante = null, observacoes = null) {
    return new Promise((resolve, reject) => {
      this.db.run(`INSERT INTO comprovantes 
        (funcionario_id, periodo_inicio, periodo_fim, valor_total, arquivo_comprovante, observacoes) 
        VALUES (?, ?, ?, ?, ?, ?)`, 
        [funcionarioId, periodoInicio, periodoFim, valorTotal, arquivoComprovante, observacoes], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  obterComprovantes(funcionarioId = null) {
    return new Promise((resolve, reject) => {
      let query = `SELECT c.*, f.nome 
        FROM comprovantes c 
        JOIN funcionarios f ON c.funcionario_id = f.id 
        ORDER BY c.data_pagamento DESC`;
      let params = [];
      
      if (funcionarioId) {
        query = `SELECT c.*, f.nome 
          FROM comprovantes c 
          JOIN funcionarios f ON c.funcionario_id = f.id 
          WHERE c.funcionario_id = ?
          ORDER BY c.data_pagamento DESC`;
        params = [funcionarioId];
      }
      
      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Método para obter comprovantes com informações detalhadas
  obterComprovantesDetalhados(funcionarioId = null) {
    return new Promise((resolve, reject) => {
      let query = `SELECT c.*, f.nome, f.diaria
        FROM comprovantes c 
        JOIN funcionarios f ON c.funcionario_id = f.id 
        WHERE f.ativo = 1`;
      let params = [];
      
      if (funcionarioId) {
        query += ` AND c.funcionario_id = ?`;
        params = [funcionarioId];
      }
      
      query += ` ORDER BY c.data_pagamento DESC`;
      
      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Método para obter comprovantes por funcionário
  obterComprovantesPorFuncionario(funcionarioId) {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT 
          c.*,
          f.nome as funcionario_nome
        FROM comprovantes c
        JOIN funcionarios f ON c.funcionario_id = f.id
        WHERE c.funcionario_id = ?
        ORDER BY c.data_pagamento DESC
      `, [funcionarioId], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // Método para obter todos os comprovantes
  obterTodosComprovantes() {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT 
          c.*,
          f.nome as funcionario_nome
        FROM comprovantes c
        JOIN funcionarios f ON c.funcionario_id = f.id
        ORDER BY c.data_pagamento DESC
      `, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // Método para excluir comprovante
  excluirComprovante(comprovanteId) {
    return new Promise((resolve, reject) => {
      // Primeiro, obter dados do comprovante para excluir arquivo
      this.db.get('SELECT arquivo_comprovante FROM comprovantes WHERE id = ?', [comprovanteId], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        
        // Excluir arquivo se existir
        if (row && row.arquivo_comprovante) {
          const fs = require('fs');
          const path = require('path');
          const caminhoArquivo = path.join(__dirname, 'data', 'comprovantes', row.arquivo_comprovante);
          
          try {
            if (fs.existsSync(caminhoArquivo)) {
              fs.unlinkSync(caminhoArquivo);
            }
          } catch (error) {
            console.error('Erro ao excluir arquivo:', error);
          }
        }
        
        // Excluir registro do banco
        this.db.run('DELETE FROM comprovantes WHERE id = ?', [comprovanteId], function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ success: true, changes: this.changes });
          }
        });
      });
    });
  }

  // Método para salvar arquivo de comprovante fisicamente
  async salvarArquivoComprovante(arquivo, funcionarioId, periodo) {
    const fs = require('fs');
    const path = require('path');
    
    try {
      // Criar pasta de comprovantes se não existir
      const comprovantesDir = path.join(__dirname, 'data', 'comprovantes');
      if (!fs.existsSync(comprovantesDir)) {
        fs.mkdirSync(comprovantesDir, { recursive: true });
      }
      
      // Criar pasta específica do funcionário
      const funcionarioDir = path.join(comprovantesDir, `funcionario_${funcionarioId}`);
      if (!fs.existsSync(funcionarioDir)) {
        fs.mkdirSync(funcionarioDir, { recursive: true });
      }
      
      // Gerar nome único para o arquivo
      const extensao = path.extname(arquivo.name);
      const nomeArquivo = `comprovante_${periodo}_${Date.now()}${extensao}`;
      const caminhoCompleto = path.join(funcionarioDir, nomeArquivo);
      
      // Salvar arquivo
      fs.writeFileSync(caminhoCompleto, arquivo.buffer);
      
      // Retornar nome completo com pasta do funcionário
      return `funcionario_${funcionarioId}/${nomeArquivo}`;
    } catch (error) {
      console.error('Erro ao salvar arquivo:', error);
      return null;
    }
  }

  // Métodos para relatórios e estatísticas (sem diária do pai)
  obterTotalGanhos(dataInicio, dataFim) {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT 
          COUNT(DISTINCT dt.data) as dias_trabalhados,
          SUM(f.diaria) as total_funcionarios,
          (SELECT valor FROM configuracoes WHERE chave = 'diaria_veiculo') as diaria_veiculo
        FROM dias_trabalho dt 
        JOIN funcionarios f ON dt.funcionario_id = f.id 
        WHERE dt.data BETWEEN ? AND ? AND dt.trabalhou = 1
      `, [dataInicio, dataFim], async (err, rows) => {
        if (err) reject(err);
        else {
          const row = rows[0];
          const diasTrabalhados = row.dias_trabalhados || 0;
          const totalFuncionarios = row.total_funcionarios || 0;
          const diariaVeiculo = parseFloat(row.diaria_veiculo) || 0;
          
          const resultado = {
            diasTrabalhados,
            totalFuncionarios,
            totalVeiculo: diasTrabalhados * diariaVeiculo,
            totalGeral: totalFuncionarios + (diasTrabalhados * diariaVeiculo)
          };

          // Salvar no histórico se for um mês completo
          const inicio = new Date(dataInicio);
          const fim = new Date(dataFim);
          const isMesCompleto = inicio.getDate() === 1 && 
                               fim.getMonth() === inicio.getMonth() && 
                               fim.getDate() === new Date(fim.getFullYear(), fim.getMonth() + 1, 0).getDate();
          
          if (isMesCompleto) {
            try {
              await this.salvarHistoricoMensal(inicio.getFullYear(), inicio.getMonth() + 1, resultado);
            } catch (error) {
              console.log('Erro ao salvar histórico:', error);
            }
          }
          
          resolve(resultado);
        }
      });
    });
  }

  // Métodos para histórico mensal
  salvarHistoricoMensal(ano, mes, dados) {
    return new Promise((resolve, reject) => {
      this.db.run(`INSERT OR REPLACE INTO historico_mensal 
        (ano, mes, total_funcionarios, total_veiculo, dias_trabalhados, total_geral) 
        VALUES (?, ?, ?, ?, ?, ?)`, 
        [ano, mes, dados.totalFuncionarios, dados.totalVeiculo, dados.diasTrabalhados, dados.totalGeral], 
        function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  obterHistoricoMensal(ano = null, mes = null) {
    return new Promise((resolve, reject) => {
      let query = "SELECT * FROM historico_mensal ORDER BY ano DESC, mes DESC";
      let params = [];
      
      if (ano && mes) {
        query = "SELECT * FROM historico_mensal WHERE ano = ? AND mes = ? ORDER BY ano DESC, mes DESC";
        params = [ano, mes];
      } else if (ano) {
        query = "SELECT * FROM historico_mensal WHERE ano = ? ORDER BY mes DESC";
        params = [ano];
      }
      
      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  obterTotalGeral() {
    return new Promise((resolve, reject) => {
      this.db.get(`SELECT 
        SUM(total_funcionarios) as total_funcionarios_geral,
        SUM(total_veiculo) as total_veiculo_geral,
        SUM(total_geral) as total_geral_geral,
        SUM(dias_trabalhados) as total_dias_geral
        FROM historico_mensal`, (err, row) => {
        if (err) reject(err);
        else resolve(row || {
          total_funcionarios_geral: 0,
          total_veiculo_geral: 0,
          total_geral_geral: 0,
          total_dias_geral: 0
        });
      });
    });
  }

  // Métodos para relatórios gerados
  salvarRelatorio(tipo, dataInicio, dataFim, nomeRelatorio, dadosRelatorio, totalFuncionarios, totalVeiculo, totalGeral, diasTrabalhados) {
    return new Promise((resolve, reject) => {
      const dataGeracao = new Date().toISOString();
      this.db.run(
        `INSERT INTO relatorios (tipo, data_inicio, data_fim, nome_relatorio, dados_relatorio, 
         total_funcionarios, total_veiculo, total_geral, dias_trabalhados, data_geracao) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [tipo, dataInicio, dataFim, nomeRelatorio, dadosRelatorio, 
         totalFuncionarios, totalVeiculo, totalGeral, diasTrabalhados, dataGeracao],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  obterRelatorios() {
    return new Promise((resolve, reject) => {
      this.db.all(
        "SELECT * FROM relatorios ORDER BY data_geracao DESC LIMIT 50",
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  obterRelatorioPorId(relatorioId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        "SELECT * FROM relatorios WHERE id = ?",
        [relatorioId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  excluirRelatorio(relatorioId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "DELETE FROM relatorios WHERE id = ?",
        [relatorioId],
        function(err) {
          if (err) reject(err);
          else resolve({ success: true, changes: this.changes });
        }
      );
    });
  }

  obterUltimoRelatorioQuinzenal() {
    return new Promise((resolve, reject) => {
      this.db.get(
        "SELECT * FROM relatorios WHERE tipo = 'Quinzenal' ORDER BY data_geracao DESC LIMIT 1",
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  obterProximoDiaTrabalho(dataReferencia) {
    return new Promise((resolve, reject) => {
      this.db.get(
        "SELECT MIN(data) as proxima_data FROM dias_trabalho WHERE data > ? ORDER BY data",
        [dataReferencia],
        (err, row) => {
          if (err) reject(err);
          else resolve(row ? row.proxima_data : null);
        }
      );
    });
  }

  limparBancoDados() {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run("DELETE FROM comprovantes", (err) => {
          if (err) console.error('Erro ao limpar comprovantes:', err);
        });
        
        this.db.run("DELETE FROM relatorios", (err) => {
          if (err) console.error('Erro ao limpar relatórios:', err);
        });
        
        this.db.run("DELETE FROM historico_mensal", (err) => {
          if (err) console.error('Erro ao limpar histórico mensal:', err);
        });
        
        this.db.run("DELETE FROM dias_trabalho", (err) => {
          if (err) console.error('Erro ao limpar dias de trabalho:', err);
        });
        
        this.db.run("DELETE FROM funcionarios", (err) => {
          if (err) console.error('Erro ao limpar funcionários:', err);
        });
        
        this.db.run("UPDATE sqlite_sequence SET seq = 0 WHERE name IN ('funcionarios', 'dias_trabalho', 'comprovantes', 'relatorios', 'historico_mensal')", function(err) {
          if (err) {
            console.error('Erro ao resetar sequências:', err);
            reject(err);
          } else {
            console.log('Banco de dados limpo com sucesso!');
            resolve({ success: true, message: 'Todos os dados foram removidos do banco' });
          }
        });
      });
    });
  }

  close() {
    this.db.close();
  }
}

module.exports = Database;
