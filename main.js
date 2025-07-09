const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const Database = require('./database');

// Desabilitar aceleração de GPU para evitar crashes
app.disableHardwareAcceleration();

// Desabilitar o processo de GPU separado
app.commandLine.appendSwitch('--disable-gpu');
app.commandLine.appendSwitch('--disable-gpu-sandbox');
app.commandLine.appendSwitch('--disable-software-rasterizer');
app.commandLine.appendSwitch('--disable-background-timer-throttling');
app.commandLine.appendSwitch('--disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('--disable-renderer-backgrounding');

// Inicializar banco de dados
let db;

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: path.join(__dirname, 'agenda.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      webSecurity: false,
      allowRunningInsecureContent: true,
      backgroundThrottling: false
    },
    show: false, // Não mostrar até que esteja pronto
    autoHideMenuBar: true, // Esconder menu bar
    titleBarStyle: 'default'
  });

  win.loadFile('index.html');
  
  // Mostrar janela quando estiver pronta
  win.once('ready-to-show', () => {
    console.log('Janela pronta para ser exibida');
    win.show();
    win.focus();
    console.log('Janela exibida com sucesso');
  });

  // Logs adicionais para debug
  win.webContents.on('did-finish-load', () => {
    console.log('Conteúdo carregado completamente');
  });

  win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Falha ao carregar:', errorCode, errorDescription);
  });

  // Prevenir erro de GPU
  win.webContents.on('gpu-process-crashed', (event, killed) => {
    console.log('GPU process crashed, but continuing...');
  });

  // Abrir DevTools apenas em desenvolvimento
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools();
  }

  // Prevenir navegação externa
  win.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    if (parsedUrl.origin !== 'file://') {
      event.preventDefault();
    }
  });

  return win;
}

app.whenReady().then(async () => {
  try {
    console.log('Aplicação iniciando...');
    
    // Inicializar banco de dados
    db = new Database();
    console.log('Banco de dados inicializado');
    

    
    // Criar janela principal
    createWindow();
    console.log('Janela principal criada');
    

    
  } catch (error) {
    console.error('Erro durante inicialização:', error);
    // Tentar novamente após 2 segundos
    setTimeout(() => {
      createWindow();
    }, 2000);
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    if (db) db.close();
    app.quit();
  }
});

// IPC Handlers para comunicação com o renderer

// Funcionários
ipcMain.handle('funcionarios:obter', async () => {
  return await db.obterFuncionarios();
});

ipcMain.handle('funcionarios:adicionar', async (event, nome, diaria) => {
  return await db.adicionarFuncionario(nome, diaria);
});

ipcMain.handle('funcionarios:atualizar', async (event, id, nome, diaria) => {
  return await db.atualizarFuncionario(id, nome, diaria);
});

ipcMain.handle('funcionarios:excluir', async (event, id) => {
  return await db.excluirFuncionario(id);
});

// Dias de trabalho
ipcMain.handle('dias:marcar', async (event, funcionarioId, data, trabalhou, observacoes) => {
  return await db.marcarDiaTrabalho(funcionarioId, data, trabalhou, observacoes);
});

ipcMain.handle('dias:obter', async (event, dataInicio, dataFim) => {
  return await db.obterDiasTrabalho(dataInicio, dataFim);
});

// Handler para obter dias de trabalho por funcionário
ipcMain.handle('diasTrabalho:obterPorFuncionario', async (event, funcionarioId, dataInicio, dataFim) => {
  return await db.obterDiasPorFuncionario(funcionarioId, dataInicio, dataFim);
});

// Configurações
ipcMain.handle('config:obter', async (event, chave) => {
  return await db.obterConfiguracao(chave);
});

ipcMain.handle('config:atualizar', async (event, chave, valor) => {
  return await db.atualizarConfiguracao(chave, valor);
});

// Comprovantes
ipcMain.handle('comprovantes:adicionar', async (event, funcionarioId, periodoInicio, periodoFim, valorTotal, arquivoComprovante, observacoes) => {
  return await db.adicionarComprovante(funcionarioId, periodoInicio, periodoFim, valorTotal, arquivoComprovante, observacoes);
});

ipcMain.handle('comprovantes:obter', async (event, funcionarioId) => {
  return await db.obterComprovantes(funcionarioId);
});

// Handlers melhorados para comprovantes
ipcMain.handle('comprovantes:obterDetalhados', async (event, funcionarioId) => {
  return await db.obterComprovantesDetalhados(funcionarioId);
});

// Adicionar novos handlers para comprovantes
ipcMain.handle('comprovantes:obterPorFuncionario', async (event, funcionarioId) => {
  return await db.obterComprovantesPorFuncionario(funcionarioId);
});

ipcMain.handle('comprovantes:obterTodos', async () => {
  return await db.obterTodosComprovantes();
});

ipcMain.handle('comprovantes:excluir', async (event, comprovanteId) => {
  return await db.excluirComprovante(comprovanteId);
});

// Estatísticas por funcionário
ipcMain.handle('funcionarios:estatisticas', async (event, funcionarioId, dataInicio, dataFim) => {
  try {
    console.log(`Buscando estatísticas para funcionário ID=${funcionarioId}, período: ${dataInicio} a ${dataFim}`);
    const dias = await db.obterDiasPorFuncionario(funcionarioId, dataInicio, dataFim);
    console.log(`Dias encontrados: ${dias.length}`);
    
    const funcionario = await db.obterFuncionarios();
    const funcInfo = funcionario.find(f => f.id === funcionarioId);
    
    if (!funcInfo) {
      console.log('Erro: Funcionário não encontrado');
      throw new Error('Funcionário não encontrado');
    }
    
    const totalDias = dias.length;
    const totalGanho = totalDias * funcInfo.diaria;
    
    console.log(`Total dias: ${totalDias}, Total ganho: R$ ${totalGanho}`);
    
    return {
      funcionario: funcInfo,
      totalDias,
      totalGanho,
      diasDetalhados: dias
    };
  } catch (error) {
    console.error('Erro ao obter estatísticas:', error);
    throw error;
  }
});

// Handler para salvar arquivo de comprovante
ipcMain.handle('comprovantes:salvarArquivo', async (event, dadosArquivo, funcionarioId, periodo) => {
  return await db.salvarArquivoComprovante(dadosArquivo, funcionarioId, periodo);
});

// Relatórios
ipcMain.handle('relatorios:totalGanhos', async (event, dataInicio, dataFim) => {
  return await db.obterTotalGanhos(dataInicio, dataFim);
});

// Diálogos de arquivo
ipcMain.handle('dialog:abrirArquivo', async (event, options) => {
  const result = await dialog.showOpenDialog(options);
  return result;
});

ipcMain.handle('dialog:salvarArquivo', async (event, options) => {
  const result = await dialog.showSaveDialog(options);
  return result;
});


// Histórico mensal
ipcMain.handle('historico:salvar', async (event, ano, mes, dados) => {
  return await db.salvarHistoricoMensal(ano, mes, dados);
});

ipcMain.handle('historico:obter', async (event, ano, mes) => {
  return await db.obterHistoricoMensal(ano, mes);
});

ipcMain.handle('historico:totalGeral', async () => {
  return await db.obterTotalGeral();
});

// Handlers para relatórios
ipcMain.handle('relatorios:salvar', async (event, tipo, dataInicio, dataFim, nomeRelatorio, dadosRelatorio, totalFuncionarios, totalVeiculo, totalGeral, diasTrabalhados) => {
  return await db.salvarRelatorio(tipo, dataInicio, dataFim, nomeRelatorio, dadosRelatorio, totalFuncionarios, totalVeiculo, totalGeral, diasTrabalhados);
});

ipcMain.handle('relatorios:obter', async () => {
  return await db.obterRelatorios();
});

ipcMain.handle('relatorios:obterPorId', async (event, relatorioId) => {
  return await db.obterRelatorioPorId(relatorioId);
});

ipcMain.handle('relatorios:excluir', async (event, relatorioId) => {
  return await db.excluirRelatorio(relatorioId);
});

ipcMain.handle('relatorios:ultimoQuinzenal', async () => {
  return await db.obterUltimoRelatorioQuinzenal();
});

ipcMain.handle('relatorios:proximoDiaTrabalho', async (event, dataReferencia) => {
  return await db.obterProximoDiaTrabalho(dataReferencia);
});
