const { ipcRenderer } = require('electron');
// const { isFeriado } = require('./config'); // Temporariamente comentado para testar

// Função temporária para feriados (enquanto testamos)
function isFeriado(data) {
  // Feriados fixos de 2025 para teste
  const feriados2025 = [
    '2025-01-01', '2025-04-18', '2025-04-21', '2025-05-01',
    '2025-09-07', '2025-10-12', '2025-11-02', '2025-11-15', '2025-12-25'
  ];
  const dataString = data.toISOString().split('T')[0];
  return feriados2025.includes(dataString);
}

// Estado global da aplicação
let funcionarios = [];
let configuracoes = {
  diariaVeiculo: 0
};
let mesAtual = new Date();
let diaAtualSelecionado = null;
let tipoHistoricoAtual = null;

// Inicialização da aplicação
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await carregarDados();
    await atualizarCalendario();
    await atualizarDashboard();
    configurarEventos();
  } catch (error) {
    console.error("Erro na inicialização:", error);
    mostrarNotificacao('Erro na inicialização: ' + error.message, 'error');
  }
});

// Carregar dados iniciais
async function carregarDados() {
  try {
    funcionarios = await ipcRenderer.invoke('funcionarios:obter');
    configuracoes.diariaVeiculo = await ipcRenderer.invoke('config:obter', 'diaria_veiculo');
    
    if (document.getElementById('diariaVeiculo')) {
      document.getElementById('diariaVeiculo').value = configuracoes.diariaVeiculo;
    }
    
  } catch (error) {
    console.error('Erro ao carregar dados:', error);
    mostrarNotificacao('Erro ao carregar dados: ' + error.message, 'error');
  }
}

// Configurar eventos dos formulários e botões
function configurarEventos() {
  // Formulário de funcionários
  document.getElementById('formFuncionario').addEventListener('submit', async (e) => {
    e.preventDefault();
    await adicionarFuncionario();
  });

  // Formulário de configurações
  document.getElementById('formConfiguracoes').addEventListener('submit', async (e) => {
    e.preventDefault();
    await salvarConfiguracoes();
  });

  // Formulário de comprovantes
  document.getElementById('formComprovante').addEventListener('submit', async (e) => {
    e.preventDefault();
    await salvarComprovante();
  });

  // Configurar datas padrão nos relatórios
  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
  
  document.getElementById('dataInicioRelatorio').value = formatarDataInput(inicioMes);
  document.getElementById('dataFimRelatorio').value = formatarDataInput(fimMes);
}

// Gerenciamento de funcionários
async function adicionarFuncionario() {
  const nome = document.getElementById('nomeFuncionario').value.trim();
  const diaria = parseFloat(document.getElementById('diariaFuncionario').value);
  
  if (!nome || isNaN(diaria) || diaria <= 0) {
    mostrarNotificacao('Preencha todos os campos corretamente', 'error');
    return;
  }
  
  try {
    await ipcRenderer.invoke('funcionarios:adicionar', nome, diaria);
    document.getElementById('formFuncionario').reset();
    await carregarDados();
    await atualizarListaFuncionarios();
    await atualizarDashboard();
  } catch (error) {
    console.error('Erro ao adicionar funcionário:', error);
    mostrarNotificacao('Erro ao adicionar funcionário', 'error');
  }
}

async function editarFuncionario(id, nome, diaria) {
  document.getElementById('nomeFuncionario').value = nome;
  document.getElementById('diariaFuncionario').value = diaria;
  
  // Mudar o comportamento do formulário para edição
  const form = document.getElementById('formFuncionario');
  form.onsubmit = async (e) => {
    e.preventDefault();
    
    const novoNome = document.getElementById('nomeFuncionario').value.trim();
    const novaDiaria = parseFloat(document.getElementById('diariaFuncionario').value);
    
    if (!novoNome || isNaN(novaDiaria) || novaDiaria <= 0) {
      mostrarNotificacao('Preencha todos os campos corretamente', 'error');
      return;
    }
    
    try {
      await ipcRenderer.invoke('funcionarios:atualizar', id, novoNome, novaDiaria);
      form.reset();
      form.onsubmit = async (e) => {
        e.preventDefault();
        await adicionarFuncionario();
      };
      await carregarDados();
      await atualizarListaFuncionarios();
      await atualizarDashboard();
    } catch (error) {
      console.error('Erro ao atualizar funcionário:', error);
      mostrarNotificacao('Erro ao atualizar funcionário', 'error');
    }
  };
}

async function excluirFuncionario(id, nome) {
  if (confirm(`Tem certeza que deseja excluir o funcionário ${nome}?`)) {
    try {
      await ipcRenderer.invoke('funcionarios:excluir', id);
      await carregarDados();
      await atualizarListaFuncionarios();
      await atualizarDashboard();
    } catch (error) {
      console.error('Erro ao excluir funcionário:', error);
      mostrarNotificacao('Erro ao excluir funcionário', 'error');
    }
  }
}

async function atualizarListaFuncionarios() {
  const lista = document.getElementById('listaFuncionarios');
  
  if (funcionarios.length === 0) {
    lista.innerHTML = '<p>Nenhum funcionário cadastrado.</p>';
    return;
  }
  
  lista.innerHTML = funcionarios.map(funcionario => `
    <div class="funcionario-item">
      <div class="funcionario-info">
        <h4>${funcionario.nome}</h4>
        <p>Diária: R$ ${funcionario.diaria.toFixed(2)}</p>
      </div>
      <div class="funcionario-actions">
        <button class="btn btn-success btn-small" onclick="abrirPerfilFuncionario(${funcionario.id})">
          <i class="fas fa-user"></i> Ver Perfil
        </button>
        <button class="btn btn-info btn-small" onclick="editarFuncionario(${funcionario.id}, '${funcionario.nome}', ${funcionario.diaria})">
          <i class="fas fa-edit"></i> Editar
        </button>
        <button class="btn btn-danger btn-small" onclick="excluirFuncionario(${funcionario.id}, '${funcionario.nome}')">
          <i class="fas fa-trash"></i> Excluir
        </button>
      </div>
    </div>
  `).join('');
}

// Gerenciamento de configurações (removendo diariaPai)
async function salvarConfiguracoes() {
  const diariaVeiculo = parseFloat(document.getElementById('diariaVeiculo').value);
  
  if (isNaN(diariaVeiculo) || diariaVeiculo < 0) {
    mostrarNotificacao('Valor deve ser um número válido', 'error');
    return;
  }
  
  try {
    await ipcRenderer.invoke('config:atualizar', 'diaria_veiculo', diariaVeiculo);
    
    configuracoes.diariaVeiculo = diariaVeiculo;
    
    await atualizarDashboard();
    fecharModal('modalConfiguracoes');
  } catch (error) {
    console.error('Erro ao salvar configurações:', error);
    mostrarNotificacao('Erro ao salvar configurações', 'error');
  }
}

// Gerenciamento do calendário
async function atualizarCalendario() {
  try {
    
    const calendario = document.getElementById('calendario');
    const mesAno = document.getElementById('mesAtual');
    
    if (!calendario || !mesAno) {
      console.error("Elementos do calendário não encontrados");
      return;
    }
    
    // Atualizar título do mês
    const nomesMeses = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    
    mesAno.textContent = `${nomesMeses[mesAtual.getMonth()]} ${mesAtual.getFullYear()}`;
    
    // Gerar calendário
    const ano = mesAtual.getFullYear();
    const mes = mesAtual.getMonth();
    
    // Primeiro dia do mês e último dia
    const primeiroDia = new Date(ano, mes, 1);
    const ultimoDia = new Date(ano, mes + 1, 0);
    
    // Primeiro dia da semana do calendário (domingo = 0)
    const primeiroDiaSemana = primeiroDia.getDay();
    
    // Carregar dias de trabalho do mês
    const inicioMes = formatarData(primeiroDia);
    const fimMes = formatarData(formatarData(ultimoDia));
    const diasTrabalho = await ipcRenderer.invoke('dias:obter', inicioMes, fimMes);
    
    // Agrupar por data
    const trabalhosPorData = {};
    diasTrabalho.forEach(dia => {
      if (!trabalhosPorData[dia.data]) {
        trabalhosPorData[dia.data] = [];
      }
      trabalhosPorData[dia.data].push(dia);
    });
    
    let html = '<div class="calendar-grid">';
    
    // Cabeçalho dos dias da semana
    const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    diasSemana.forEach(dia => {
      html += `<div class="calendar-header">${dia}</div>`;
    });
    
    // Dias do mês anterior (para completar a primeira semana)
    const mesAnterior = new Date(ano, mes - 1, 0);
    for (let i = primeiroDiaSemana - 1; i >= 0; i--) {
      const dia = mesAnterior.getDate() - i;
      html += `<div class="calendar-day other-month">
        <div class="day-number">${dia}</div>
      </div>`;
    }
    
    // Dias do mês atual
    const hoje = new Date();
    for (let dia = 1; dia <= ultimoDia.getDate(); dia++) {
      const dataAtual = new Date(ano, mes, dia);
      const dataString = formatarData(dataAtual);
      const isHoje = dataAtual.toDateString() === hoje.toDateString();
      const isFimSemana = dataAtual.getDay() === 0 || dataAtual.getDay() === 6;
      const isFeriadoNacional = isFeriado(dataAtual);
      const temTrabalho = trabalhosPorData[dataString];
      
      let classes = 'calendar-day';
      if (isHoje) classes += ' today';
      if (isFimSemana) classes += ' weekend';
      if (isFeriadoNacional) classes += ' holiday';
      if (temTrabalho && temTrabalho.length > 0) classes += ' has-work';
      
      let trabalhadoresInfo = '';
      if (temTrabalho && temTrabalho.length > 0) {
        trabalhadoresInfo = `<div class="day-workers">
          ${temTrabalho.map(t => `<span class="worker-indicator"></span>${t.nome.split(' ')[0]}`).join('<br>')}
        </div>`;
      }
      
      html += `<div class="${classes}" onclick="abrirModalDia('${dataString}')">
        <div class="day-number">${dia}</div>
        ${trabalhadoresInfo}
      </div>`;
    }
    
    // Dias do próximo mês (para completar a última semana)
    const diasRestantes = 42 - (primeiroDiaSemana + ultimoDia.getDate());
    for (let dia = 1; dia <= diasRestantes; dia++) {
      html += `<div class="calendar-day other-month">
        <div class="day-number">${dia}</div>
      </div>`;
    }
    
    html += '</div>';
    calendario.innerHTML = html;
    
    // Atualizar funcionários trabalhando hoje
    await atualizarFuncionariosHoje();
    
  } catch (error) {
    console.error("Erro ao atualizar calendário:", error);
    mostrarNotificacao('Erro ao carregar calendário: ' + error.message, 'error');
  }
}

function mudarMes(direcao) {
  mesAtual.setMonth(mesAtual.getMonth() + direcao);
  atualizarCalendario();
  atualizarDashboard();
}

// Modal de dia de trabalho
async function abrirModalDia(data) {
  diaAtualSelecionado = data;
  const dataObj = new Date(data + 'T00:00:00');
  
  document.getElementById('tituloModalDia').textContent = 
    `Dia ${dataObj.getDate()}/${(dataObj.getMonth() + 1).toString().padStart(2, '0')}/${dataObj.getFullYear()}`;
  
  // Carregar funcionários que trabalharam neste dia
  const funcionariosDia = await ipcRenderer.invoke('dias:obter', data, data);
  const funcionariosTrabalhandoIds = funcionariosDia.map(f => f.funcionario_id);
  
  // Gerar checkboxes dos funcionários com botão "Marcar Todos"
  const container = document.getElementById('funcionariosDia');
  container.innerHTML = `
    <div class="marcar-todos-container">
      <div class="funcionario-checkbox marcar-todos">
        <input type="checkbox" id="marcarTodos" onchange="toggleTodosFuncionarios(this)">
        <label for="marcarTodos" style="font-weight: bold; color: #2c3e50;">
          <i class="fas fa-users"></i> Marcar/Desmarcar Todos
        </label>
      </div>
      <hr style="margin: 10px 0; border: 1px solid #ddd;">
    </div>
    ${funcionarios.map(funcionario => `
      <div class="funcionario-checkbox">
        <input type="checkbox" 
               id="func_${funcionario.id}" 
               value="${funcionario.id}"
               class="funcionario-individual"
               onchange="verificarEstadoMarcarTodos()"
               ${funcionariosTrabalhandoIds.includes(funcionario.id) ? 'checked' : ''}>
        <label for="func_${funcionario.id}">
          ${funcionario.nome} - R$ ${funcionario.diaria.toFixed(2)}
        </label>
      </div>
    `).join('')}
  `;
  
  // Verificar estado inicial do "Marcar Todos"
  setTimeout(() => verificarEstadoMarcarTodos(), 100);
  
  // Carregar observações se existirem
  const observacoes = funcionariosDia.length > 0 ? funcionariosDia[0].observacoes || '' : '';
  document.getElementById('observacoesDia').value = observacoes;
  
  abrirModal('modalDiaTrabalho');
}

async function salvarDiaTrabalho() {
  if (!diaAtualSelecionado) return;
  
  const funcionariosSelecionados = [];
  const checkboxes = document.querySelectorAll('.funcionario-individual');
  const observacoes = document.getElementById('observacoesDia').value;
  
  
  // Verificar quais funcionários estão marcados
  checkboxes.forEach((checkbox, index) => {
    const funcionarioId = parseInt(checkbox.value);
    const isChecked = checkbox.checked;
    
    if (isChecked) {
      funcionariosSelecionados.push(funcionarioId);
    }
  });
  
  
  try {
    // ESTRATÉGIA: Primeiro remover TODOS os registros do dia, depois adicionar apenas os selecionados
    
    // Para cada funcionário da lista, marcar como NÃO trabalhando (false)
    for (const funcionario of funcionarios) {
      await ipcRenderer.invoke('dias:marcar', funcionario.id, diaAtualSelecionado, false, '');
    }
    
    // PASSO 2: Marcar apenas os funcionários selecionados como trabalhando
    for (const funcionarioId of funcionariosSelecionados) {
      const funcionario = funcionarios.find(f => f.id === funcionarioId);
      await ipcRenderer.invoke('dias:marcar', funcionarioId, diaAtualSelecionado, true, observacoes);
    }
    
    
    // Fechar modal e atualizar interface
    fecharModal('modalDiaTrabalho');
    
    // Atualizar calendário e dashboard
    await atualizarCalendario();
    await atualizarDashboard();
    
    // Se há um funcionário sendo visualizado no perfil, atualizar também
    if (funcionarioAtualPerfil) {
      await carregarInfoFuncionario();
    }
    
    // Mostrar notificação de feedback
    if (funcionariosSelecionados.length > 0) {
    }
    
    
  } catch (error) {
    console.error('❌ ERRO ao salvar dia de trabalho:', error);
    mostrarNotificacao('Erro ao salvar dia de trabalho: ' + error.message, 'error');
  }
}

// Função para marcar/desmarcar todos os funcionários
function toggleTodosFuncionarios(checkbox) {
  const funcionariosCheckboxes = document.querySelectorAll('.funcionario-individual');
  const marcarTodos = checkbox.checked;
  
  funcionariosCheckboxes.forEach(funcCheckbox => {
    funcCheckbox.checked = marcarTodos;
  });
}

// Função para verificar o estado do "Marcar Todos" baseado nos funcionários individuais
function verificarEstadoMarcarTodos() {
  const marcarTodosCheckbox = document.getElementById('marcarTodos');
  const funcionariosCheckboxes = document.querySelectorAll('.funcionario-individual');
  
  if (!marcarTodosCheckbox || funcionariosCheckboxes.length === 0) return;
  
  const todosMarcados = Array.from(funcionariosCheckboxes).every(checkbox => checkbox.checked);
  const nenhumMarcado = Array.from(funcionariosCheckboxes).every(checkbox => !checkbox.checked);
  
  if (todosMarcados) {
    marcarTodosCheckbox.checked = true;
    marcarTodosCheckbox.indeterminate = false;
  } else if (nenhumMarcado) {
    marcarTodosCheckbox.checked = false;
    marcarTodosCheckbox.indeterminate = false;
  } else {
    marcarTodosCheckbox.checked = false;
    marcarTodosCheckbox.indeterminate = true;
  }
}

// Dashboard e estatísticas
async function atualizarDashboard() {
  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
  
  try {
    
    // Totais do mês atual (julho 2025)
    const totaisMesAtual = await ipcRenderer.invoke('relatorios:totalGanhos', 
      formatarData(inicioMes), formatarData(fimMes));
    
    // Totais HISTÓRICOS COMPLETOS (desde 2020 até hoje) 
    const dataInicioHistorico = new Date(2020, 0, 1); // 1º de janeiro de 2020
    const totaisHistoricos = await ipcRenderer.invoke('relatorios:totalGanhos', 
      formatarData(dataInicioHistorico), formatarData(hoje));
    
    
    // MOSTRAR MÊS ATUAL no dashboard
    document.getElementById('totalDiasMes').textContent = totaisMesAtual.diasTrabalhados;
    document.getElementById('totalGanhosMes').textContent = `R$ ${totaisMesAtual.totalGeral.toFixed(2)}`;
    document.getElementById('totalFuncionarios').textContent = funcionarios.length;
    document.getElementById('totalVeiculo').textContent = `R$ ${totaisMesAtual.totalVeiculo.toFixed(2)}`;
    
    // MOSTRAR TOTAIS HISTÓRICOS (incluindo todos os meses anteriores)
    const totalHistoricoElement = document.getElementById('totalGanhosHistorico');
    const diasHistoricoElement = document.getElementById('totalDiasHistorico');
    
    if (totalHistoricoElement) {
      totalHistoricoElement.textContent = `R$ ${totaisHistoricos.totalGeral.toFixed(2)}`;
    }
    
    if (diasHistoricoElement) {
      diasHistoricoElement.textContent = totaisHistoricos.diasTrabalhados;
    }
    
    // Para compatibilidade (nomes alternativos)
    const totalAnoElement = document.getElementById('totalGanhosAno');
    const diasAnoElement = document.getElementById('totalDiasAno');
    
    if (totalAnoElement) {
      totalAnoElement.textContent = `R$ ${totaisHistoricos.totalGeral.toFixed(2)}`;
    } else {
    }
    
    if (diasAnoElement) {
      diasAnoElement.textContent = totaisHistoricos.diasTrabalhados;
    } else {
    }
    
    
  } catch (error) {
    console.error('❌ Erro ao atualizar dashboard:', error);
  }
}

async function atualizarFuncionariosHoje() {
  const hoje = formatarData(new Date());
  const funcionariosHoje = await ipcRenderer.invoke('dias:obter', hoje, hoje);
  
  const container = document.getElementById('funcionariosHoje');
  
  if (funcionariosHoje.length === 0) {
    container.innerHTML = '<p class="text-muted">Nenhum funcionário trabalhando hoje.</p>';
    return;
  }
  
  container.innerHTML = funcionariosHoje.map(funcionario => `
    <span class="funcionario-presente">
      ${funcionario.nome}
    </span>
  `).join('');
}

// Relatórios em PDF
async function gerarRelatorioQuinzena() {
  
  try {
    // Processo iniciado silenciosamente
    
    // Verificar se há último relatório quinzenal para sugerir data inicial
    const ultimoRelatorio = await ipcRenderer.invoke('relatorios:ultimoQuinzenal');
    const hoje = new Date();
    let dataInicioSugerida, dataFimSugerida;
    
    if (ultimoRelatorio) {
      // Se já existe um relatório quinzenal, sugerir começar do dia seguinte ao último
      const ultimaData = new Date(ultimoRelatorio.data_fim + 'T00:00:00');
      dataInicioSugerida = new Date(ultimaData);
      dataInicioSugerida.setDate(ultimaData.getDate() + 1);
      dataFimSugerida = hoje;
    } else {
      // Primeiro relatório quinzenal - sugerir início do mês até hoje
      dataInicioSugerida = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      dataFimSugerida = hoje;
    }
    
    // Abrir modal para seleção de datas
    abrirModalRelatorioQuinzenal(dataInicioSugerida, dataFimSugerida);
    
  } catch (error) {
    console.error('Erro ao abrir relatório quinzenal:', error);
    mostrarNotificacao('Erro ao abrir relatório quinzenal: ' + error.message, 'error');
  }
}

// Modal para relatório quinzenal
function abrirModalRelatorioQuinzenal(dataInicioSugerida, dataFimSugerida) {
  // Criar modal dinamicamente
  const modalHtml = `
    <div id="modalRelatorioQuinzenal" class="modal" style="display: block;">
      <div class="modal-content">
        <div class="modal-header">
          <h2><i class="fas fa-file-pdf"></i> Gerar Relatório Quinzenal</h2>
          <span class="close" onclick="fecharModalRelatorioQuinzenal()">&times;</span>
        </div>
        <div class="modal-body">
          <div class="info-box">
            <p><i class="fas fa-info-circle"></i> Selecione o período para gerar o relatório quinzenal</p>
          </div>
          
          <div class="form-group">
            <label for="dataInicioQuinzenal">Data Início:</label>
            <input type="date" id="dataInicioQuinzenal" value="${formatarDataInput(dataInicioSugerida)}">
            <small>Data inicial do período a ser incluído no relatório</small>
          </div>
          
          <div class="form-group">
            <label for="dataFimQuinzenal">Data Fim:</label>
            <input type="date" id="dataFimQuinzenal" value="${formatarDataInput(dataFimSugerida)}">
            <small>Data final do período (padrão: hoje)</small>
          </div>
          
          <div class="preview-info" id="previewInfoQuinzenal">
            <!-- Informações de preview serão mostradas aqui -->
          </div>
          
          <div class="modal-actions">
            <button class="btn btn-primary" onclick="gerarRelatorioQuinzenalConfirmar()">
              <i class="fas fa-file-pdf"></i> Gerar Relatório
            </button>
            <button class="btn btn-secondary" onclick="fecharModalRelatorioQuinzenal()">
              <i class="fas fa-times"></i> Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Remover modal anterior se existir
  const modalAnterior = document.getElementById('modalRelatorioQuinzenal');
  if (modalAnterior) {
    modalAnterior.remove();
  }
  
  // Adicionar modal ao body
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  
  // Adicionar evento para atualizar preview quando as datas mudarem
  document.getElementById('dataInicioQuinzenal').addEventListener('change', atualizarPreviewQuinzenal);
  document.getElementById('dataFimQuinzenal').addEventListener('change', atualizarPreviewQuinzenal);
  
  // Carregar preview inicial
  atualizarPreviewQuinzenal();
}

function fecharModalRelatorioQuinzenal() {
  const modal = document.getElementById('modalRelatorioQuinzenal');
  if (modal) {
    modal.remove();
  }
}

async function atualizarPreviewQuinzenal() {
  try {
    const dataInicio = document.getElementById('dataInicioQuinzenal').value;
    const dataFim = document.getElementById('dataFimQuinzenal').value;
    const previewContainer = document.getElementById('previewInfoQuinzenal');
    
    if (!dataInicio || !dataFim) {
      previewContainer.innerHTML = '';
      return;
    }
    
    if (new Date(dataInicio) > new Date(dataFim)) {
      previewContainer.innerHTML = `
        <div class="alert alert-warning">
          <i class="fas fa-exclamation-triangle"></i> Data de início deve ser anterior à data fim
        </div>
      `;
      return;
    }
    
    // Buscar dados do período
    const diasTrabalho = await ipcRenderer.invoke('dias:obter', dataInicio, dataFim);
    
    if (diasTrabalho.length === 0) {
      previewContainer.innerHTML = `
        <div class="alert alert-info">
          <i class="fas fa-info-circle"></i> Nenhum dia de trabalho encontrado neste período
        </div>
      `;
      return;
    }
    
    // Contar funcionários únicos e dias trabalhados
    const funcionariosUnicos = [...new Set(diasTrabalho.map(d => d.funcionario_id))];
    const totalDias = diasTrabalho.length;
    
    previewContainer.innerHTML = `
      <div class="alert alert-success">
        <i class="fas fa-check-circle"></i> 
        <strong>Preview:</strong> ${funcionariosUnicos.length} funcionário(s), ${totalDias} dia(s) de trabalho encontrados
        <br><small>Período: ${formatarDataBR(dataInicio)} a ${formatarDataBR(dataFim)}</small>
      </div>
    `;
    
  } catch (error) {
    console.error('Erro ao atualizar preview:', error);
  }
}

async function gerarRelatorioQuinzenalConfirmar() {
  const dataInicio = new Date(document.getElementById('dataInicioQuinzenal').value + 'T00:00:00');
  const dataFim = new Date(document.getElementById('dataFimQuinzenal').value + 'T00:00:00');
  
  if (dataInicio > dataFim) {
    mostrarNotificacao('Data de início deve ser anterior à data fim', 'error');
    return;
  }
  
  fecharModalRelatorioQuinzenal();
  await salvarRelatorioNoBanco(dataInicio, dataFim, 'Quinzenal');
}

async function gerarRelatorioMensal() {
  
  try {
    const hoje = new Date();
    const dataInicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const dataFim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    
    
    // Processo iniciado silenciosamente
    
    await salvarRelatorioNoBanco(dataInicio, dataFim, 'Mensal');
    
  } catch (error) {
    console.error('Erro em gerarRelatorioMensal:', error);
    mostrarNotificacao('Erro ao gerar relatório mensal: ' + error.message, 'error');
  }
}

async function gerarRelatorioPersonalizado() {
  const dataInicio = new Date(document.getElementById('dataInicioRelatorio').value);
  const dataFim = new Date(document.getElementById('dataFimRelatorio').value);
  
  if (dataInicio > dataFim) {
    mostrarNotificacao('Data de início deve ser anterior à data fim', 'error');
    return;
  }
  
  await salvarRelatorioNoBanco(dataInicio, dataFim, 'Personalizado');
}

async function salvarRelatorioNoBanco(dataInicio, dataFim, tipo) {
  try {
    
    // Carregar dados do período
    const diasTrabalho = await ipcRenderer.invoke('dias:obter', 
      formatarData(dataInicio), formatarData(dataFim));
    
    
    const totais = await ipcRenderer.invoke('relatorios:totalGanhos',
      formatarData(dataInicio), formatarData(dataFim));
    
    
    // Agrupar dados por funcionário
    const funcionariosDados = {};
    const diasUnicos = new Set(); // Para contar dias únicos
    
    diasTrabalho.forEach(dia => {
      if (!funcionariosDados[dia.funcionario_id]) {
        funcionariosDados[dia.funcionario_id] = {
          nome: dia.nome,
          diaria: dia.diaria,
          dias: []
        };
      }
      funcionariosDados[dia.funcionario_id].dias.push({
        data: dia.data,
        observacoes: dia.observacoes
      });
      
      // Adicionar data única ao conjunto (sem duplicatas)
      diasUnicos.add(dia.data);
    });
    
    // Total de dias únicos trabalhados (não soma de funcionários)
    const totalDiasUnicos = diasUnicos.size;
    
    
    // Calcular totais
    let totalFuncionarios = 0;
    Object.values(funcionariosDados).forEach(func => {
      totalFuncionarios += func.dias.length * func.diaria;
    });
    
    const totalVeiculo = totais.totalVeiculo || 0;
    const totalGeral = totalFuncionarios + totalVeiculo;
    
    // Preparar dados do relatório
    const dadosRelatorio = {
      funcionarios: funcionariosDados,
      periodo: {
        inicio: formatarDataBR(dataInicio),
        fim: formatarDataBR(dataFim)
      },
      resumo: {
        totalFuncionarios,
        totalVeiculo,
        totalGeral,
        diasTrabalhados: totalDiasUnicos // Usar dias únicos
      }
    };
    
    
    const totaisResumo = {
      totalFuncionarios,
      totalVeiculo, 
      totalGeral,
      diasTrabalhados: totalDiasUnicos // Usar dias únicos
    };
    
    // Nome do relatório
    const nomeRelatorio = `Relatório ${tipo} - ${formatarDataBR(dataInicio)} a ${formatarDataBR(dataFim)}`;
    
    
    // Salvar no banco
    await ipcRenderer.invoke('relatorios:salvar', 
      tipo, formatarData(dataInicio), formatarData(dataFim), 
      nomeRelatorio, JSON.stringify(dadosRelatorio), 
      totaisResumo.totalFuncionarios, totaisResumo.totalVeiculo, 
      totaisResumo.totalGeral, totaisResumo.diasTrabalhados);
    
    
    // Processo finalizado silenciosamente - apenas confirmar geração de PDF
    
    // Oferecer opção de gerar PDF
    if (confirm('Relatório salvo! Deseja gerar um PDF para download agora?')) {
      await gerarPDFDoRelatorio(dadosRelatorio, nomeRelatorio);
    } else {
    }
    
    
  } catch (error) {
    console.error('Erro ao salvar relatório:', error);
    mostrarNotificacao('Erro ao salvar relatório: ' + error.message, 'error');
  }
};

// Função para gerar PDF a partir dos dados salvos
async function gerarPDFDoRelatorio(dadosRelatorio, nomeRelatorio) {
  try {
    
    // Verificar se window.jspdf está disponível
    
    if (!window.jspdf) {
      console.error('window.jspdf não está disponível!');
      alert('Erro: jsPDF não foi carregado. Verifique a conexão com a internet.');
      return;
    }
    
    if (!window.jspdf.jsPDF) {
      console.error('window.jspdf.jsPDF não está disponível!');
      alert('Erro: jsPDF.jsPDF não encontrado.');
      return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    
    // Adicionar conteúdo ao PDF
    
    // Título principal
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text('RELATÓRIO DE TRABALHO', 105, 20, { align: 'center' });
    
    // Subtítulo
    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    doc.text(nomeRelatorio, 105, 30, { align: 'center' });
    doc.text(`Período: ${dadosRelatorio.periodo.inicio} a ${dadosRelatorio.periodo.fim}`, 105, 38, { align: 'center' });
    
    // CAIXA DE DESTAQUE PARA O VALOR TOTAL (como fatura de cartão)
    const valorTotal = dadosRelatorio.resumo.totalGeral;
    
    // Fundo azul claro para a caixa de destaque
    doc.setFillColor(230, 240, 255); // Azul muito claro
    doc.rect(120, 50, 75, 25, 'F'); // Caixa preenchida no lado direito
    
    // Borda azul escura
    doc.setDrawColor(52, 73, 94); // Azul escuro
    doc.setLineWidth(1);
    doc.rect(120, 50, 75, 25); // Borda da caixa
    
    // Texto "VALOR TOTAL A PAGAR" em azul escuro
    doc.setTextColor(52, 73, 94);
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('VALOR TOTAL A PAGAR', 157.5, 58, { align: 'center' });
    
    // Valor em destaque - maior e em cor vermelha
    doc.setTextColor(204, 0, 0); // Vermelho para destaque
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text(`R$ ${valorTotal.toFixed(2).replace('.', ',')}`, 157.5, 70, { align: 'center' });
    
    // Resetar cor do texto para preto
    doc.setTextColor(0, 0, 0);
    
    // Resumo Geral (lado esquerdo)
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('RESUMO:', 20, 55);
    
    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    doc.text(`Funcionários: R$ ${dadosRelatorio.resumo.totalFuncionarios.toFixed(2).replace('.', ',')}`, 20, 64);
    doc.text(`Veículo: R$ ${dadosRelatorio.resumo.totalVeiculo.toFixed(2).replace('.', ',')}`, 20, 70);
    doc.text(`Dias Trabalhados: ${dadosRelatorio.resumo.diasTrabalhados}`, 20, 76);
    
    // Preparar dados para a tabela
    const dadosTabela = [];
    
    if (dadosRelatorio.funcionarios && Object.keys(dadosRelatorio.funcionarios).length > 0) {
      Object.values(dadosRelatorio.funcionarios).forEach(func => {
        // Verificações de segurança
        if (!func || !func.dias || !Array.isArray(func.dias)) {
          console.warn('Dados de funcionário inválidos:', func);
          return;
        }
        
        const totalFuncionario = func.dias.length * (func.diaria || 0);
        const nome = func.nome || 'Nome não informado';
        
        dadosTabela.push([
          nome,
          func.dias.length.toString(),
          `R$ ${(func.diaria || 0).toFixed(2).replace('.', ',')}`,
          `R$ ${totalFuncionario.toFixed(2).replace('.', ',')}`
        ]);
      });
    }
    
    if (dadosTabela.length === 0) {
      doc.text('Nenhum funcionário encontrado neste período', 20, 95);
    } else {
      // Título da tabela
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('DETALHES POR FUNCIONÁRIO:', 20, 95);
      
      // Verificar se autoTable está disponível
      if (doc.autoTable) {
        
        doc.autoTable({
          startY: 100,
          head: [['Funcionário', 'Dias', 'Diária', 'Total']],
          body: dadosTabela,
          theme: 'grid',
          styles: {
            fontSize: 10,
            cellPadding: 3,
            valign: 'middle'
          },
          headStyles: {
            fillColor: [52, 73, 94], // Azul escuro para cabeçalho
            textColor: [255, 255, 255], // Texto branco
            fontStyle: 'bold'
          },
          columnStyles: {
            0: { cellWidth: 60 }, // Funcionário
            1: { cellWidth: 25, halign: 'center' }, // Dias
            2: { cellWidth: 35, halign: 'right' }, // Diária
            3: { cellWidth: 35, halign: 'right' }  // Total
          },
          margin: { left: 20, right: 20 },
          alternateRowStyles: {
            fillColor: [248, 249, 250] // Linhas alternadas em cinza claro
          }
        });
      } else {
        // Fallback para tabela simples se autoTable não estiver disponível
        let y = 105;
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        
        // Cabeçalho
        doc.text('Funcionário', 20, y);
        doc.text('Dias', 90, y);
        doc.text('Diária', 120, y);
        doc.text('Total', 160, y);
        
        // Linha do cabeçalho
        doc.line(15, y + 2, 195, y + 2);
        y += 8;
        
        doc.setFont(undefined, 'normal');
        
        // Dados
        dadosTabela.forEach(linha => {
          doc.text(linha[0].length > 25 ? linha[0].substring(0, 22) + '...' : linha[0], 20, y);
          doc.text(linha[1], 90, y);
          doc.text(linha[2], 120, y);
          doc.text(linha[3], 160, y);
          y += 8;
          
          // Verificar se precisa de nova página
          if (y > 270) {
            doc.addPage();
            y = 20;
          }
        });
        // Linha final
        doc.line(15, y + 2, 195, y + 2);
      }
    }
    
    
    // Adicionar rodapé com informações importantes
    const pageHeight = doc.internal.pageSize.height;
    let finalY = pageHeight - 40;
    
    // Linha separadora no rodapé
    doc.setDrawColor(200, 200, 200);
    doc.line(20, finalY - 10, 190, finalY - 10);
    
    // Repetir o valor total no rodapé (como fatura)
    doc.setFillColor(255, 240, 240); // Fundo rosa claro
    doc.rect(120, finalY - 5, 70, 20, 'F');
    
    doc.setDrawColor(204, 0, 0);
    doc.setLineWidth(1.5);
    doc.rect(120, finalY - 5, 70, 20);
    
    doc.setTextColor(204, 0, 0);
    doc.setFontSize(8);
    doc.setFont(undefined, 'bold');
    doc.text('VALOR FINAL A PAGAR', 155, finalY - 1, { align: 'center' });
    
    doc.setFontSize(14);
    doc.text(`R$ ${dadosRelatorio.resumo.totalGeral.toFixed(2).replace('.', ',')}`, 155, finalY + 8, { align: 'center' });
    
    // Informações da empresa/pessoa (lado esquerdo do rodapé)
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    doc.text('Relatório gerado automaticamente', 20, finalY);
    doc.text(`Data de geração: ${new Date().toLocaleDateString('pt-BR')}`, 20, finalY + 5);
    doc.text('Sistema de Controle de Diárias', 20, finalY + 10);
    
    // Resetar cor
    doc.setTextColor(0, 0, 0);
    
    
    // Nome do arquivo (tratando acentos e caracteres especiais)
    let nomeArquivoLimpo = removerAcentos(nomeRelatorio)
      .replace(/[^a-zA-Z0-9\s-]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_'); // Remove underscores duplos
    
    const nomeArquivo = `${nomeArquivoLimpo}.pdf`;
    
    // Salvar o PDF
    doc.save(nomeArquivo);
    
    // PDF gerado silenciosamente - usuário já vê o download
    
  } catch (error) {
    console.error('ERRO na geração de PDF:', error);
    console.error('Stack trace:', error.stack);
    mostrarNotificacao('Erro ao gerar PDF: ' + error.message, 'error');
  }
}

// Histórico mensal
async function abrirModalHistorico(tipo) {
  tipoHistoricoAtual = tipo;
  
  const titulos = {
    'ganhos': 'Histórico de Ganhos Mensais',
    'veiculo': 'Histórico de Ganhos do Veículo'
  };
  
  document.getElementById('tituloHistorico').textContent = titulos[tipo];
  
  // Carregar anos disponíveis
  await carregarAnosDisponiveis();
  
  // Carregar totais gerais
  await carregarTotaisGerais();
  
  // Carregar histórico do ano atual
  await carregarHistorico();
  
  abrirModal('modalHistorico');
}

// Função para carregar anos disponíveis no histórico
async function carregarAnosDisponiveis() {
  try {
    // Carregar anos para o histórico geral
    const anoAtual = new Date().getFullYear();
    const selectAno = document.getElementById('anoHistorico');
    
    if (selectAno) {
      selectAno.innerHTML = '';
      // Adicionar anos de 2020 até o ano atual + 1
      for (let ano = 2020; ano <= anoAtual + 1; ano++) {
        const option = document.createElement('option');
        option.value = ano;
        option.textContent = ano;
        if (ano === anoAtual) {
          option.selected = true;
        }
        selectAno.appendChild(option);
      }
    }
    
    // Carregar anos para o histórico do funcionário
    const selectAnoFuncionario = document.getElementById('anoHistoricoFuncionario');
    if (selectAnoFuncionario) {
      selectAnoFuncionario.innerHTML = '';
      for (let ano = 2020; ano <= anoAtual + 1; ano++) {
        const option = document.createElement('option');
        option.value = ano;
        option.textContent = ano;
        if (ano === anoAtual) {
          option.selected = true;
        }
        selectAnoFuncionario.appendChild(option);
      }
    }
    
  } catch (error) {
    console.error('Erro ao carregar anos:', error);
  }
}

// Função para carregar histórico do funcionário
async function carregarHistoricoFuncionario() {

  try {
    // Verificar se a aba de histórico está ativa
    const abaHistorico = document.getElementById('abaPerfilHistorico');
    if (!abaHistorico || !abaHistorico.classList.contains('active')) {
      return;
    }
    
    const container = document.getElementById('historicoFuncionario');
    if (!container) {
      console.error('❌ Container historicoFuncionario não encontrado');
      return;
    }
    
    // Para fins de depuração, adicionamos um texto temporário para garantir que o container está visível
    container.innerHTML = '<p>Carregando histórico...</p>';
    
    if (!funcionarioAtualPerfil) {
      container.innerHTML = '<p class="text-muted">Selecione um funcionário para ver o histórico.</p>';
      return;
    }
    
    
    const anoElement = document.getElementById('anoHistoricoFuncionario');
    const mesElement = document.getElementById('mesHistoricoFuncionario');
    
    if (!anoElement || !mesElement) {
      console.error('❌ Elementos de ano ou mês não encontrados');
      container.innerHTML = '<p class="text-muted">Filtros de ano/mês não encontrados.</p>';
      return;
    }
    
    const ano = anoElement.value;
    const mes = mesElement.value;
    
    
    let dataInicio, dataFim;
    if (mes) {
      dataInicio = new Date(ano, mes - 1, 1);
      dataFim = new Date(ano, mes, 0);
    } else {
      dataInicio = new Date(ano, 0, 1);
      dataFim = new Date(ano, 11, 31);
    }
    
    
    container.innerHTML = '<p>Consultando dados...</p>';
    
    const estatisticas = await ipcRenderer.invoke('funcionarios:estatisticas', 
      funcionarioAtualPerfil.id, 
      formatarData(dataInicio), 
      formatarData(dataFim)
    );
    
    
    if (!estatisticas.diasDetalhados || estatisticas.diasDetalhados.length === 0) {
      container.innerHTML = '<p class="text-muted">Nenhum dia trabalhado encontrado para o período selecionado.</p>';
      return;
    }
    
    
    // Para fins de depuração, mostrar os dias encontrados no console
    estatisticas.diasDetalhados.forEach(dia => {
    });
    
    // Agrupar por mês
    const diasPorMes = {};
    estatisticas.diasDetalhados.forEach(dia => {
      const data = new Date(dia.data);
      const mesAno = `${data.getFullYear()}-${(data.getMonth() + 1).toString().padStart(2, '0')}`;
      if (!diasPorMes[mesAno]) diasPorMes[mesAno] = [];
      diasPorMes[mesAno].push(dia);
    });
    
    const meses = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    
    Object.keys(diasPorMes).forEach(mesAno => {
    });
    
    // Limpar o container antes de adicionar o novo conteúdo
    container.innerHTML = '';
    
    // Criar e adicionar o resumo
    const resumoDiv = document.createElement('div');
    resumoDiv.className = 'historico-resumo-funcionario';
    resumoDiv.innerHTML = `
      <div class="resumo-card">
        <h4><i class="fas fa-chart-bar"></i> Resumo do Período Selecionado</h4>
        <div class="resumo-stats">
          <div class="stat-box">
            <span class="stat-number">${estatisticas.totalDias}</span>
            <span class="stat-label">Dias Trabalhados</span>
          </div>
          <div class="stat-box">
            <span class="stat-number">R$ ${estatisticas.totalGanho.toFixed(2)}</span>
            <span class="stat-label">Total Ganho</span>
          </div>
          <div class="stat-box">
            <span class="stat-number">R$ ${funcionarioAtualPerfil.diaria.toFixed(2)}</span>
            <span class="stat-label">Valor da Diária</span>
          </div>
        </div>
      </div>
    `;
    
    // Adicionar o resumo ao container principal
    container.appendChild(resumoDiv);
    
    // Parte 2: Detalhamento por mês - cabeçalho
    const detalhamentoHTML = document.createElement('div');
    detalhamentoHTML.className = 'historico-mensal-funcionario';
    detalhamentoHTML.innerHTML = `
      <h4><i class="fas fa-calendar-alt"></i> Detalhamento por Mês</h4>
    `;
    
    // Parte 3: Container de meses
    const mesesContainer = document.createElement('div');
    mesesContainer.className = 'meses-container';
    
    // Adicionar cada mês separadamente
    Object.keys(diasPorMes).forEach(mesAno => {
      const [ano, mes] = mesAno.split('-');
      const mesNome = meses[parseInt(mes) - 1];
      const diasMes = diasPorMes[mesAno];
      const totalDiasMes = diasMes.length;
      const totalGanhoMes = totalDiasMes * funcionarioAtualPerfil.diaria;
      
      const mesCard = document.createElement('div');
      mesCard.className = 'mes-card';
      
      mesCard.innerHTML = `
        <div class="mes-header">
          <h5><i class="fas fa-calendar"></i> ${mesNome} ${ano}</h5>
          <div class="mes-stats">
            <span class="dias-count">${totalDiasMes} dias</span>
            <span class="valor-mes">R$ ${totalGanhoMes.toFixed(2)}</span>
          </div>
        </div>
        <div class="dias-trabalhados">
          <label>Dias trabalhados:</label>
          <div class="dias-grid">
      `;
      
      // Adicionar cada dia trabalhado
      diasMes.forEach(dia => {
        const data = new Date(dia.data);
        const diaNum = data.getDate().toString().padStart(2, '0');
        const diaBadge = document.createElement('span');
        diaBadge.className = 'dia-badge';
        diaBadge.title = formatarDataBR(dia.data);
        diaBadge.textContent = diaNum;
        
        mesCard.querySelector('.dias-grid').appendChild(diaBadge);
      });
      
      mesesContainer.appendChild(mesCard);
    });
    
    detalhamentoHTML.appendChild(mesesContainer);
    container.appendChild(detalhamentoHTML);
    
  } catch (error) {
    console.error('❌ Erro ao carregar histórico do funcionário:', error);
    const container = document.getElementById('historicoFuncionario');
    if (container) {
      container.innerHTML = `<p class="text-muted">Erro ao carregar histórico: ${error.message}</p>`;
    }
  }
  
}

// Comprovantes de pagamento
async function abrirModalComprovante(dataInicio, dataFim, valorSugerido) {
  // Carregar funcionários no select
  const select = document.getElementById('funcionarioComprovante');
  select.innerHTML = '<option value="">Selecione um funcionário</option>';
  
  funcionarios.forEach(funcionario => {
    const option = document.createElement('option');
    option.value = funcionario.id;
    option.textContent = funcionario.nome;
    select.appendChild(option);
  });
  
  // Preencher datas se fornecidas
  if (dataInicio) {
    document.getElementById('periodoInicioComprovante').value = dataInicio;
  }
  if (dataFim) {
    document.getElementById('periodoFimComprovante').value = dataFim;
  }
  if (valorSugerido) {
    document.getElementById('valorComprovante').value = valorSugerido.toFixed(2);
  }
  
  abrirModal('modalComprovante');
}

async function salvarComprovante() {
  const funcionarioId = document.getElementById('funcionarioComprovante').value;
  const periodoInicio = document.getElementById('periodoInicioComprovante').value;
  const periodoFim = document.getElementById('periodoFimComprovante').value;
  const valor = parseFloat(document.getElementById('valorComprovante').value);
  const arquivoInput = document.getElementById('arquivoComprovante');
  const arquivo = arquivoInput.files[0];
  const observacoes = document.getElementById('observacoesComprovante').value.trim() || null;
  
  if (!funcionarioId || !periodoInicio || !periodoFim || isNaN(valor)) {
    mostrarNotificacao('Preencha todos os campos obrigatórios', 'error');
    return;
  }
  
  try {
    let nomeArquivoSalvo = null;
    
    // Se há arquivo, processar salvamento
    if (arquivo) {
      const fs = require('fs');
      const path = require('path');
      
      // Ler arquivo como buffer
      const reader = new FileReader();
      reader.onload = async function(e) {
        try {
          const buffer = e.target.result;
          const dadosArquivo = {
            name: arquivo.name,
            buffer: new Uint8Array(buffer)
          };
          
          // Salvar arquivo fisicamente
          const periodo = `${periodoInicio}_${periodoFim}`;
          nomeArquivoSalvo = await ipcRenderer.invoke('comprovantes:salvarArquivo', 
            dadosArquivo, parseInt(funcionarioId), periodo);
          
          // Salvar no banco de dados
          await ipcRenderer.invoke('comprovantes:adicionar', 
            parseInt(funcionarioId), periodoInicio, periodoFim, valor, nomeArquivoSalvo, observacoes);
          
          document.getElementById('formComprovante').reset();
          fecharModal('modalComprovante');
          
        } catch (error) {
          console.error('Erro ao salvar comprovante:', error);
          mostrarNotificacao('Erro ao salvar comprovante', 'error');
        }
      };
      reader.readAsArrayBuffer(arquivo);
    } else {
      // Salvar apenas dados no banco
      await ipcRenderer.invoke('comprovantes:adicionar', 
        parseInt(funcionarioId), periodoInicio, periodoFim, valor, null, observacoes);
      
      document.getElementById('formComprovante').reset();
      fecharModal('modalComprovante');
    }
    
  } catch (error) {
    console.error('Erro ao salvar comprovante:', error);
    mostrarNotificacao('Erro ao salvar comprovante', 'error');
  }
}

function abrirComprovante(nomeArquivo) {
  const path = require('path');
  const { shell } = require('electron');
  
  const caminhoArquivo = path.join(__dirname, 'data', 'comprovantes', nomeArquivo);
  shell.openPath(caminhoArquivo).catch(error => {
    console.error('Erro ao abrir comprovante:', error);
    mostrarNotificacao('Erro ao abrir comprovante', 'error');
  });
}

// Funções para gerenciar relatórios e comprovantes salvos
function formatarMoeda(valor) {
  return `R$ ${(valor || 0).toFixed(2).replace('.', ',')}`;
}

// Variável global para o funcionário selecionado
let funcionarioAtualPerfil = null;

// Função para abrir perfil detalhado do funcionário
async function abrirPerfilFuncionario(funcionarioId) {
  try {
    funcionarioAtualPerfil = funcionarios.find(f => f.id === funcionarioId);
    
    if (!funcionarioAtualPerfil) {
      mostrarNotificacao('Funcionário não encontrado', 'error');
      return;
    }
    
    // Atualizar título
    document.getElementById('tituloPerfilFuncionario').textContent = `Perfil - ${funcionarioAtualPerfil.nome}`;
    
    // Carregar dados do funcionário - apenas informações básicas
    await carregarInfoFuncionario();
    
    // Limpar conteúdo do histórico para evitar carregar dados desnecessários
    const historicoContainer = document.getElementById('historicoFuncionario');
    if (historicoContainer) {
      historicoContainer.innerHTML = '';
    }
    
    // Ativar primeira aba (informações) sem carregar outros dados
    document.querySelectorAll('.perfil-funcionario-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('#modalPerfilFuncionario .tab-content').forEach(content => content.classList.remove('active'));
    
    document.querySelector('.perfil-funcionario-tabs .tab-btn').classList.add('active');
    document.getElementById('abaPerfilInfo').classList.add('active');
    
    abrirModal('modalPerfilFuncionario');
    
  } catch (error) {
    console.error('Erro ao abrir perfil do funcionário:', error);
    mostrarNotificacao('Erro ao carregar perfil do funcionário', 'error');
  }
}

// Função para alternar abas do perfil do funcionário
function alternarAbaPerfilFuncionario(abaId) {
  
  // Remover classe active de todos os botões e conteúdos
  document.querySelectorAll('.perfil-funcionario-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('#modalPerfilFuncionario .tab-content').forEach(content => content.classList.remove('active'));
  
  // Ativar botão clicado
  event.target.classList.add('active');
  
  // Mostrar conteúdo correspondente
  let conteudoId;
  if (abaId === 'info') {
    conteudoId = 'abaPerfilInfo';
  } else if (abaId === 'comprovantes') {
    conteudoId = 'abaPerfilComprovantes';
  } else if (abaId === 'historico') {
    conteudoId = 'abaPerfilHistorico';
  }
  
  const conteudo = document.getElementById(conteudoId);
  if (conteudo) {
    conteudo.classList.add('active');
    
    // Carregar dados específicos da aba APENAS quando a aba for ativada
    if (abaId === 'comprovantes') {
      // Carregar apenas comprovantes quando a aba de comprovantes for selecionada
      carregarComprovantesPerfilFuncionario();
    } else if (abaId === 'historico') {
      
      // Carregar os anos disponíveis e depois o histórico APENAS para a aba histórico
      setTimeout(() => {
        carregarAnosDisponiveis().then(() => {
          carregarHistoricoFuncionario();
        });
      }, 200);
    }
  } else {
    console.error('Elemento não encontrado:', conteudoId);
    const elementos = document.querySelectorAll('#modalPerfilFuncionario .tab-content');
    console.error('Elementos disponíveis:', Array.from(elementos).map(el => el.id));
  }
}

// Função para carregar informações do funcionário
async function carregarInfoFuncionario() {
  if (!funcionarioAtualPerfil) return;
  
  try {
    // Atualizar informações básicas
    document.getElementById('perfilNomeFuncionario').textContent = funcionarioAtualPerfil.nome;
    document.getElementById('perfilDiariaFuncionario').textContent = `R$ ${funcionarioAtualPerfil.diaria.toFixed(2)}`;
    
    // Calcular totais do funcionário - TODOS OS REGISTROS HISTÓRICOS
    
    // Buscar desde 2020 até hoje para pegar TODOS os registros históricos
    const dataInicioHistorico = new Date(2020, 0, 1); // 1º de janeiro de 2020
    const hoje = new Date();
    
    
    const diasTrabalho = await ipcRenderer.invoke('dias:obter', 
      formatarData(dataInicioHistorico), formatarData(hoje));
    
    
    const diasFuncionario = diasTrabalho.filter(dia => dia.funcionario_id === funcionarioAtualPerfil.id);
    const totalDias = diasFuncionario.length;
    const totalGanho = totalDias * funcionarioAtualPerfil.diaria;
    
    // Atualizar campos no perfil
    document.getElementById('perfilTotalDias').textContent = totalDias;
    document.getElementById('perfilTotalGanho').textContent = `R$ ${totalGanho.toFixed(2)}`;
    
  } catch (error) {
    console.error('❌ Erro ao carregar informações do funcionário:', error);
  }
}

// Função para carregar comprovantes do funcionário
async function carregarComprovantesPerfilFuncionario() {
  if (!funcionarioAtualPerfil) return;
  
  try {
    const comprovantes = await ipcRenderer.invoke('comprovantes:obterPorFuncionario', funcionarioAtualPerfil.id);
    const lista = document.getElementById('listaComprovantesPerfilFuncionario');
    
    if (!comprovantes || comprovantes.length === 0) {
      lista.innerHTML = '<p class="text-muted">Nenhum comprovante cadastrado para este funcionário.</p>';
      return;
    }
    
    lista.innerHTML = comprovantes.map(comprovante => `
      <div class="comprovante-item-perfil">
        <div class="comprovante-info">
          <h5>Período: ${formatarDataBR(comprovante.periodo_inicio)} a ${formatarDataBR(comprovante.periodo_fim)}</h5>
          <p><strong>Valor:</strong> R$ ${comprovante.valor_total.toFixed(2)}</p>
          <p><strong>Data do pagamento:</strong> ${formatarDataBR(comprovante.data_pagamento)}</p>
          ${comprovante.observacoes ? `<p><strong>Observações:</strong> ${comprovante.observacoes}</p>` : ''}
        </div>
        <div class="comprovante-actions">
          ${comprovante.arquivo_comprovante ? `
            <button class="btn btn-info btn-small" onclick="abrirComprovante('${comprovante.arquivo_comprovante}')">
              <i class="fas fa-eye"></i> Ver Arquivo
            </button>
          ` : ''}
          <button class="btn btn-danger btn-small" onclick="excluirComprovantePerfilFuncionario(${comprovante.id})">
            <i class="fas fa-trash"></i> Excluir
          </button>
        </div>
      </div>
    `).join('');
    
  } catch (error) {
    console.error('Erro ao carregar comprovantes do funcionário:', error);
    document.getElementById('listaComprovantesPerfilFuncionario').innerHTML = 
      '<p class="text-muted">Erro ao carregar comprovantes.</p>';
  }
}

// Configurar eventos do formulário de comprovante do perfil
document.addEventListener('DOMContentLoaded', () => {
  // ...existing code...
  
  // Adicionar evento para o formulário de comprovante do perfil
  if (document.getElementById('formComprovantePerfilFuncionario')) {
    document.getElementById('formComprovantePerfilFuncionario').addEventListener('submit', async (e) => {
      e.preventDefault();
      await salvarComprovantePerfilFuncionario();
    });
  }
});

// Função para salvar comprovante do perfil do funcionário
async function salvarComprovantePerfilFuncionario() {
  if (!funcionarioAtualPerfil) return;
  
  const periodoInicio = document.getElementById('periodoInicioPerfilComprovante').value;
  const periodoFim = document.getElementById('periodoFimPerfilComprovante').value;
  const valor = parseFloat(document.getElementById('valorPerfilComprovante').value);
  const observacoes = document.getElementById('observacoesPerfilComprovante').value;
  const arquivoInput = document.getElementById('arquivoPerfilComprovante');
  const arquivo = arquivoInput.files[0];
  
  if (!periodoInicio || !periodoFim || isNaN(valor)) {
    mostrarNotificacao('Preencha todos os campos obrigatórios', 'error');
    return;
  }
  
  try {
    let nomeArquivoSalvo = null;
    
    // Se há arquivo, processar salvamento
    if (arquivo) {
      const reader = new FileReader();
      reader.onload = async function(e) {
        try {
          const buffer = e.target.result;
          const dadosArquivo = {
            name: arquivo.name,
            buffer: new Uint8Array(buffer)
          };
          
          // Salvar arquivo fisicamente
          const periodo = `${periodoInicio}_${periodoFim}`;
          nomeArquivoSalvo = await ipcRenderer.invoke('comprovantes:salvarArquivo', 
            dadosArquivo, funcionarioAtualPerfil.id, periodo);
          
          // Salvar no banco de dados
          await ipcRenderer.invoke('comprovantes:adicionar', 
            funcionarioAtualPerfil.id, periodoInicio, periodoFim, valor, nomeArquivoSalvo, observacoes);
          
          document.getElementById('formComprovantePerfilFuncionario').reset();
          await carregarComprovantesPerfilFuncionario();
          
        } catch (error) {
          console.error('Erro ao salvar comprovante:', error);
          mostrarNotificacao('Erro ao salvar comprovante', 'error');
        }
      };
      reader.readAsArrayBuffer(arquivo);
    } else {
      // Salvar apenas dados no banco
      await ipcRenderer.invoke('comprovantes:adicionar', 
        funcionarioAtualPerfil.id, periodoInicio, periodoFim, valor, null, observacoes);
      
      document.getElementById('formComprovantePerfilFuncionario').reset();
      await carregarComprovantesPerfilFuncionario();
    }
    
  } catch (error) {
    console.error('Erro ao salvar comprovante:', error);
    mostrarNotificacao('Erro ao salvar comprovante', 'error');
  }
}

// Função para excluir comprovante do perfil
async function excluirComprovantePerfilFuncionario(comprovanteId) {
  if (confirm('Tem certeza que deseja excluir este comprovante?')) {
    try {
      await ipcRenderer.invoke('comprovantes:excluir', comprovanteId);
      await carregarComprovantesPerfilFuncionario();
    } catch (error) {
      console.error('Erro ao excluir comprovante:', error);
      mostrarNotificacao('Erro ao excluir comprovante', 'error');
    }
  }
}

// Funções essenciais de modal que estavam faltando
function abrirModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden'; // Prevenir scroll do body
  } else {
    console.error("Modal não encontrado:", modalId);
  }
}

function fecharModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = 'auto'; // Restaurar scroll do body
  } else {
    console.error("Modal não encontrado:", modalId);
  }
}

function alternarAba(abaId) {
  
  // Remover classe active de todos os botões de aba
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Remover classe active de todos os conteúdos de aba
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  
  // Ativar o botão clicado
  event.target.classList.add('active');
  
  // Mostrar o conteúdo correspondente
  const conteudo = document.getElementById(`aba${abaId.charAt(0).toUpperCase() + abaId.slice(1)}`);
  if (conteudo) {
    conteudo.classList.add('active');
    
    // Se for a aba de lista, atualizar a lista de funcionários
    if (abaId === 'lista') {
      atualizarListaFuncionarios();
    }
    // Se for a aba de perfis, atualizar os perfis
    else if (abaId === 'perfis') {
      atualizarPerfisFuncionarios();
    }
  }
}

// Função para atualizar a aba de perfis de funcionários
async function atualizarPerfisFuncionarios() {
  const container = document.getElementById('funcionariosPerfis');
  
  if (funcionarios.length === 0) {
    container.innerHTML = '<p>Nenhum funcionário cadastrado.</p>';
    return;
  }
  
  container.innerHTML = funcionarios.map(funcionario => `
    <div class="funcionario-perfil-card" onclick="abrirPerfilFuncionario(${funcionario.id})">
      <div class="funcionario-avatar">
        <i class="fas fa-user-circle"></i>
      </div>
      <div class="funcionario-dados">
        <h4>${funcionario.nome}</h4>
        <p>Diária: <strong>R$ ${funcionario.diaria.toFixed(2)}</strong></p>
        <button class="btn btn-primary btn-small">
          <i class="fas fa-eye"></i> Ver Perfil
        </button>
      </div>
    </div>
  `).join('');
}

// Função para mostrar notificações
function mostrarNotificacao(mensagem, tipo = 'info') {
  
  // Remover notificação anterior se existir
  const notificacaoAnterior = document.querySelector('.notificacao');
  if (notificacaoAnterior) {
    notificacaoAnterior.remove();
  }
  
  // Criar nova notificação
  const notificacao = document.createElement('div');
  notificacao.className = `notificacao notificacao-${tipo}`;
  notificacao.innerHTML = `
    <div class="notificacao-content">
      <span>${mensagem}</span>
      <button onclick="this.parentElement.parentElement.remove()">&times;</button>
    </div>
  `;
  
  document.body.appendChild(notificacao);
  
  // Auto remover após 5 segundos
  setTimeout(() => {
    if (notificacao.parentElement) {
      notificacao.remove();
    }
  }, 5000);
}

// Fechar modais quando clicar fora deles
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal')) {
    e.target.style.display = 'none';
    document.body.style.overflow = 'auto';
  }
});

// Fechar modais com ESC
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const modalsAbertos = document.querySelectorAll('.modal[style*="block"]');
    modalsAbertos.forEach(modal => {
      modal.style.display = 'none';
    });
    document.body.style.overflow = 'auto';
  }
});

// Funções utilitárias que estavam faltando
function formatarData(data) {
  if (!data) return '';
  const d = new Date(data);
  const ano = d.getFullYear();
  const mes = (d.getMonth() + 1).toString().padStart(2, '0');
  const dia = d.getDate().toString().padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function formatarDataInput(data) {
  if (!data) return '';
  const d = new Date(data);
  const ano = d.getFullYear();
  const mes = (d.getMonth() + 1).toString().padStart(2, '0');
  const dia = d.getDate().toString().padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function formatarDataBR(data) {
  if (!data) return '';
  
  let d;
  if (typeof data === 'string') {
    // Se for string ISO (YYYY-MM-DDTHH:mm:ss.sssZ) ou formato YYYY-MM-DD
    if (data.includes('T') || data.includes(' ')) {
      d = new Date(data);
    } else {
      d = new Date(data + 'T00:00:00');
    }
  } else if (data instanceof Date) {
    d = new Date(data);
  } else {
    return '';
  }
  
  // Verificar se a data é válida
  if (isNaN(d.getTime())) {
    return '';
  }
  
  const dia = d.getDate().toString().padStart(2, '0');
  const mes = (d.getMonth() + 1).toString().padStart(2, '0');
  const ano = d.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

// Função específica para formatar data e hora completa
function formatarDataHoraBR(data) {
  if (!data) return '';
  
  let d;
  if (typeof data === 'string') {
    d = new Date(data);
  } else if (data instanceof Date) {
    d = new Date(data);
  } else {
    return '';
  }
  
  // Verificar se a data é válida
  if (isNaN(d.getTime())) {
    return '';
  }
  
  const dia = d.getDate().toString().padStart(2, '0');
  const mes = (d.getMonth() + 1).toString().padStart(2, '0');
  const ano = d.getFullYear();
  const horas = d.getHours().toString().padStart(2, '0');
  const minutos = d.getMinutes().toString().padStart(2, '0');
  
  return `${dia}/${mes}/${ano} às ${horas}:${minutos}`;
}

// Função utilitária para remover acentos e caracteres especiais
function removerAcentos(texto) {
  return texto
    .replace(/á|à|ã|â/g, 'a')
    .replace(/é|è|ê/g, 'e')
    .replace(/í|ì|î/g, 'i')
    .replace(/ó|ò|õ|ô/g, 'o')
    .replace(/ú|ù|û/g, 'u')
    .replace(/ç/g, 'c')
    .replace(/Á|À|Ã|Â/g, 'A')
    .replace(/É|È|Ê/g, 'E')
    .replace(/Í|Ì|Î/g, 'I')
    .replace(/Ó|Ò|Õ|Ô/g, 'O')
    .replace(/Ú|Ù|Û/g, 'U')
    .replace(/Ç/g, 'C')
    .replace(/Relatório/g, 'Relatorio'); // Específico para nossa aplicação
}

// Função para abrir modal de relatórios
async function abrirModalRelatorios() {
  try {
    // Ativar primeira aba (relatórios)
    document.querySelectorAll('.relatorios-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('#modalRelatorios .tab-content').forEach(content => content.classList.remove('active'));
    
    document.querySelector('.relatorios-tabs .tab-btn').classList.add('active');
    document.getElementById('abaRelatorios').classList.add('active');
    
    // Carregar relatórios gerados
    await carregarRelatoriosGerados();
    
    // Abrir modal
    abrirModal('modalRelatorios');
  } catch (error) {
    console.error('Erro ao abrir modal de relatórios:', error);
    mostrarNotificacao('Erro ao carregar relatórios', 'error');
  }
}

// Função para carregar relatórios gerados
async function carregarRelatoriosGerados(dataInicio = null, dataFim = null) {
  try {
    const relatorios = await ipcRenderer.invoke('relatorios:obter');
    const lista = document.getElementById('listaRelatoriosGerados');
    
    if (!relatorios || relatorios.length === 0) {
      lista.innerHTML = '<p>Nenhum relatório encontrado.</p>';
      return;
    }
    
    // Filtrar relatórios se há filtro de data
    let relatoriosFiltrados = relatorios;
    if (dataInicio || dataFim) {
      relatoriosFiltrados = relatorios.filter(relatorio => {
        if (dataInicio && relatorio.data_inicio < dataInicio) return false;
        if (dataFim && relatorio.data_fim > dataFim) return false;
        return true;
      });
    }
    
    if (relatoriosFiltrados.length === 0) {
      lista.innerHTML = '<p>Nenhum relatório encontrado para o período selecionado.</p>';
      return;
    }
    
    lista.innerHTML = relatoriosFiltrados.map(relatorio => `
      <div class="relatorio-item">
        <div class="relatorio-info">
          <h4><i class="fas fa-file-alt"></i> ${relatorio.nome_relatorio}</h4>
          <p><strong>Período:</strong> ${formatarDataBR(relatorio.data_inicio)} - ${formatarDataBR(relatorio.data_fim)}</p>
          <p><strong>Tipo:</strong> ${relatorio.tipo}</p>
          <p><strong>Gerado em:</strong> ${relatorio.data_geracao ? formatarDataHoraBR(relatorio.data_geracao) : 'Data não registrada'}</p>
          <div class="relatorio-resumo">
            <span class="resumo-item"><strong>Total Funcionários:</strong> R$ ${relatorio.total_funcionarios ? relatorio.total_funcionarios.toFixed(2) : '0,00'}</span>
            <span class="resumo-item"><strong>Total Veículo:</strong> R$ ${relatorio.total_veiculo ? relatorio.total_veiculo.toFixed(2) : '0,00'}</span>
            <span class="resumo-item"><strong>Total Geral:</strong> R$ ${relatorio.total_geral ? relatorio.total_geral.toFixed(2) : '0,00'}</span>
            <span class="resumo-item"><strong>Dias:</strong> ${relatorio.dias_trabalhados || 0}</span>
          </div>
        </div>
        <div class="relatorio-actions">
          <button class="btn btn-info btn-small" onclick="visualizarRelatorio(${relatorio.id})">
            <i class="fas fa-eye"></i> Visualizar
          </button>
          <button class="btn btn-primary btn-small" onclick="gerarPDFRelatorioSalvo(${relatorio.id})">
            <i class="fas fa-file-pdf"></i> Gerar PDF
          </button>
          <button class="btn btn-danger btn-small" onclick="excluirRelatorio(${relatorio.id})">
            <i class="fas fa-trash"></i> Excluir
          </button>
        </div>
      </div>
    `).join('');
    
  } catch (error) {
    console.error('Erro ao carregar relatórios:', error);
    document.getElementById('listaRelatoriosGerados').innerHTML = '<p>Erro ao carregar relatórios.</p>';
  }
}

// Função para carregar comprovantes no modal
async function carregarComprovantesModal(funcionarioId = null, mes = null) {
  try {
    const comprovantes = await ipcRenderer.invoke('comprovantes:obterTodos');
    const lista = document.getElementById('listaComprovantes');
    
    if (!comprovantes || comprovantes.length === 0) {
      lista.innerHTML = '<p>Nenhum comprovante encontrado.</p>';
      return;
    }
    
    // Filtrar comprovantes
    let comprovantesFiltrados = comprovantes;
    
    if (funcionarioId) {
      comprovantesFiltrados = comprovantesFiltrados.filter(c => c.funcionario_id == funcionarioId);
    }
    
    if (mes) {
      comprovantesFiltrados = comprovantesFiltrados.filter(c => {
        const dataInicio = new Date(c.periodo_inicio);
        return (dataInicio.getMonth() + 1) == mes;
      });
    }
    
    if (comprovantesFiltrados.length === 0) {
      lista.innerHTML = '<p>Nenhum comprovante encontrado para os filtros selecionados.</p>';
      return;
    }
    
    lista.innerHTML = comprovantesFiltrados.map(comprovante => `
      <div class="comprovante-item">
        <div class="comprovante-info">
          <h4><i class="fas fa-user"></i> ${comprovante.funcionario_nome}</h4>
          <p><strong>Período:</strong> ${formatarDataBR(comprovante.periodo_inicio)} - ${formatarDataBR(comprovante.periodo_fim)}</p>
          <p><strong>Valor:</strong> ${formatarMoeda(comprovante.valor_total)}</p>
          <p><strong>Data do pagamento:</strong> ${formatarDataBR(comprovante.data_pagamento)}</p>
          ${comprovante.observacoes ? `<p><strong>Obs:</strong> ${comprovante.observacoes}</p>` : ''}
        </div>
        <div class="comprovante-actions">
          ${comprovante.arquivo_comprovante ? 
            `<button class="btn btn-info btn-small" onclick="abrirComprovante('${comprovante.arquivo_comprovante}')">
              <i class="fas fa-eye"></i> Ver Arquivo
            </button>` : 
            '<span class="sem-arquivo">Sem arquivo</span>'
          }
          <button class="btn btn-danger btn-small" onclick="excluirComprovante(${comprovante.id})">
            <i class="fas fa-trash"></i> Excluir
          </button>
        </div>
      </div>
    `).join('');
    
  } catch (error) {
    console.error('Erro ao carregar comprovantes:', error);
    document.getElementById('listaComprovantes').innerHTML = '<p>Erro ao carregar comprovantes.</p>';
  }
}

// Função para baixar relatório
function baixarRelatorio(caminhoArquivo, nomeArquivo) {
  const { shell } = require('electron');
  const path = require('path');
  
  // Se o caminho for relativo, completar com o diretório do app
  let caminhoCompleto = caminhoArquivo;
  if (!path.isAbsolute(caminhoArquivo)) {
    caminhoCompleto = path.join(__dirname, caminhoArquivo);
  }
  
  
  shell.openPath(caminhoCompleto).catch(error => {
    console.error('Erro ao abrir relatório:', error);
    mostrarNotificacao('Erro ao abrir relatório', 'error');
  });
}

// Função para alternar abas no modal de relatórios
function alternarAbaRelatorios(abaId) {
  // Remover classe active de todos os botões e conteúdos
  document.querySelectorAll('.relatorios-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('#modalRelatorios .tab-content').forEach(content => content.classList.remove('active'));
  
  // Ativar botão clicado
  event.target.classList.add('active');
  
  // Mostrar conteúdo correspondente
  const conteudo = document.getElementById(`aba${abaId.charAt(0).toUpperCase() + abaId.slice(1)}`);
  if (conteudo) {
    conteudo.classList.add('active');
    
    // Carregar dados específicos da aba
    if (abaId === 'relatorios') {
      carregarRelatoriosGerados();
    } else if (abaId === 'comprovantes') {
      carregarFuncionariosParaFiltro();
      carregarComprovantesModal();
    }
  }
}

// Função para carregar funcionários no filtro de comprovantes
async function carregarFuncionariosParaFiltro() {
  try {
    const select = document.getElementById('funcionarioFiltroComprovante');
    select.innerHTML = '<option value="">Todos os funcionários</option>';
    
    funcionarios.forEach(funcionario => {
      const option = document.createElement('option');
      option.value = funcionario.id;
      option.textContent = funcionario.nome;
      select.appendChild(option);
    });
  } catch (error) {
    console.error('Erro ao carregar funcionários para filtro:', error);
  }
}

// Função para filtrar relatórios por data
function filtrarRelatorios() {
  const dataInicio = document.getElementById('dataInicioRelatorio').value;
  const dataFim = document.getElementById('dataFimRelatorio').value;
  
  // Recarregar relatórios com filtro
  carregarRelatoriosGerados(dataInicio, dataFim);
}

// Função para limpar filtros de relatórios
function limparFiltrosRelatorios() {
  document.getElementById('dataInicioRelatorio').value = '';
  document.getElementById('dataFimRelatorio').value = '';
  carregarRelatoriosGerados();
}

// Função para filtrar comprovantes
function filtrarComprovantes() {
  const funcionarioId = document.getElementById('funcionarioFiltroComprovante').value;
  const mes = document.getElementById('mesFiltroComprovante').value;
  
  // Recarregar comprovantes com filtro
  carregarComprovantesModal(funcionarioId, mes);
}

// Função para limpar filtros de comprovantes
function limparFiltrosComprovantes() {
  document.getElementById('funcionarioFiltroComprovante').value = '';
  document.getElementById('mesFiltroComprovante').value = '';
  carregarComprovantesModal();
}

// Função para excluir comprovante do modal principal
async function excluirComprovante(comprovanteId) {
  if (confirm('Tem certeza que deseja excluir este comprovante?')) {
    try {
      await ipcRenderer.invoke('comprovantes:excluir', comprovanteId);
      await carregarComprovantesModal();
    } catch (error) {
      console.error('Erro ao excluir comprovante:', error);
      mostrarNotificacao('Erro ao excluir comprovante', 'error');
    }
  }
}

// Função para visualizar relatório salvo
async function visualizarRelatorio(relatorioId) {
  try {
    const relatorio = await ipcRenderer.invoke('relatorios:obterPorId', relatorioId);
    if (!relatorio) {
      mostrarNotificacao('Relatório não encontrado', 'error');
      return;
    }
    
    const dados = JSON.parse(relatorio.dados_relatorio);
    
    // Criar modal para visualização com layout melhorado
    const modalHtml = `
      <div id="modalVisualizarRelatorio" class="modal" style="display: block;">
        <div class="modal-content large">
          <div class="modal-header">
            <h2><i class="fas fa-file-alt"></i> ${relatorio.nome_relatorio}</h2>
            <span class="close" onclick="document.getElementById('modalVisualizarRelatorio').remove()">&times;</span>
          </div>
          <div class="modal-body">
            <div class="relatorio-visualizacao">
              <!-- Cabeçalho do Relatório -->
              <div class="relatorio-cabecalho">
                <div class="cabecalho-info">
                  <h3><i class="fas fa-calendar-alt"></i> Período: ${dados.periodo.inicio} a ${dados.periodo.fim}</h3>
                  <div class="meta-info">
                    <span class="badge badge-primary">${relatorio.tipo}</span>
                    <span class="data-geracao">Gerado em: ${formatarDataHoraBR(relatorio.data_geracao)}</span>
                  </div>
                </div>
              </div>
              
              <!-- Resumo Visual Destacado -->
              <div class="relatorio-resumo-destaque">
                <h4><i class="fas fa-chart-pie"></i> Resumo Financeiro</h4>
                <div class="resumo-grid-melhorado">
                  <div class="resumo-card funcionarios">
                    <div class="card-icon"><i class="fas fa-users"></i></div>
                    <div class="card-content">
                      <strong>R$ ${dados.resumo.totalFuncionarios.toFixed(2)}</strong>
                      <p>Total Funcionários</p>
                    </div>
                  </div>
                  <div class="resumo-card veiculo">
                    <div class="card-icon"><i class="fas fa-car"></i></div>
                    <div class="card-content">
                      <strong>R$ ${dados.resumo.totalVeiculo.toFixed(2)}</strong>
                      <p>Total Veículo</p>
                    </div>
                  </div>
                  <div class="resumo-card total-destaque">
                    <div class="card-icon"><i class="fas fa-calculator"></i></div>
                    <div class="card-content">
                      <strong>R$ ${dados.resumo.totalGeral.toFixed(2)}</strong>
                      <p>TOTAL A PAGAR</p>
                    </div>
                  </div>
                  <div class="resumo-card dias">
                    <div class="card-icon"><i class="fas fa-calendar-check"></i></div>
                    <div class="card-content">
                      <strong>${dados.resumo.diasTrabalhados}</strong>
                      <p>Dias Trabalhados</p>
                    </div>
                  </div>
                </div>
              </div>
              
              <!-- Detalhes por Funcionário Melhorados -->
              <div class="relatorio-funcionarios-melhorado">
                <h4><i class="fas fa-user-friends"></i> Detalhamento por Funcionário</h4>
                <div class="funcionarios-grid">
                  ${Object.values(dados.funcionarios).map(func => {
                    const totalFunc = func.dias.length * func.diaria;
                    return `
                      <div class="funcionario-card-detalhado">
                        <div class="funcionario-header">
                          <h5><i class="fas fa-user"></i> ${func.nome}</h5>
                          <div class="funcionario-total">R$ ${totalFunc.toFixed(2)}</div>
                        </div>
                        <div class="funcionario-stats">
                          <div class="stat-item">
                            <span class="label">Dias trabalhados:</span>
                            <span class="value">${func.dias.length}</span>
                          </div>
                          <div class="stat-item">
                            <span class="label">Valor da diária:</span>
                            <span class="value">R$ ${func.diaria.toFixed(2)}</span>
                          </div>
                        </div>
                        <div class="funcionario-datas">
                          <h6><i class="fas fa-calendar-day"></i> Datas Trabalhadas:</h6>
                          <div class="datas-container">
                            ${func.dias.map(dia => {
                              const dataFormatada = formatarDataBR(dia.data);
                              const diaSemana = new Date(dia.data + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short' });
                              return `<span class="data-badge-melhorada" title="${dia.observacoes || 'Sem observações'}">
                                ${dataFormatada} <small>(${diaSemana})</small>
                              </span>`;
                            }).join('')}
                          </div>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
              
              <!-- Botões de Ação -->
              <div class="relatorio-acoes">
                <button class="btn btn-primary" onclick="regenerarPDFRelatorio(${relatorioId})">
                  <i class="fas fa-file-pdf"></i> Baixar PDF
                </button>
                <button class="btn btn-secondary" onclick="document.getElementById('modalVisualizarRelatorio').remove()">
                  <i class="fas fa-times"></i> Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
  } catch (error) {
    console.error('Erro ao visualizar relatório:', error);
    mostrarNotificacao('Erro ao visualizar relatório', 'error');
  }
}

// Função para regenerar PDF a partir da visualização
async function regenerarPDFRelatorio(relatorioId) {
  try {
    const relatorio = await ipcRenderer.invoke('relatorios:obterPorId', relatorioId);
    if (!relatorio) {
      alert('Relatório não encontrado');
      return;
    }
    
    const dados = JSON.parse(relatorio.dados_relatorio);
    await gerarPDFDoRelatorio(dados, relatorio.nome_relatorio);
    
  } catch (error) {
    console.error('Erro ao regenerar PDF:', error);
    alert('Erro ao gerar PDF: ' + error.message);
  }
}

// Função para excluir relatório
async function excluirRelatorio(relatorioId) {
  if (confirm('Tem certeza que deseja excluir este relatório?')) {
    try {
      await ipcRenderer.invoke('relatorios:excluir', relatorioId);
      await carregarRelatoriosGerados();
    } catch (error) {
      console.error('Erro ao excluir relatório:', error);
      mostrarNotificacao('Erro ao excluir relatório', 'error');
    }
  }
}

// Função de teste para geração de PDF
async function testarGeracaoPDF() {
  
  const dadosTeste = {
    funcionarios: {
      1: {
        nome: 'João Silva',
        diaria: 100.00,
        dias: [
          { data: '2025-07-01', observacoes: 'Teste' },
          { data: '2025-07-02', observacoes: 'Teste 2' }
        ]
      }
    },
    periodo: {
      inicio: '01/07/2025',
      fim: '02/07/2025'
    },
    resumo: {
      totalFuncionarios: 200.00,
      totalVeiculo: 50.00,
      totalGeral: 250.00,
      diasTrabalhados: 2
    }
  };
  
  await gerarPDFDoRelatorio(dadosTeste, 'Relatório Teste PDF');
}

// Função para testar diretamente os botões de relatório
window.testarBotoesRelatorio = function() {
  
  try {
    gerarRelatorioMensal();
  } catch (error) {
    console.error('❌ Erro ao chamar gerarRelatorioMensal:', error);
  }
  
  setTimeout(() => {
    try {
      gerarRelatorioQuinzena();
    } catch (error) {
      console.error('❌ Erro ao chamar gerarRelatorioQuinzena:', error);
    }
  }, 2000);
  
};

// Função para testar só a geração de PDF sem backend
window.testarSoPDF = function() {
  
  const dadosTeste = {
    funcionarios: {
      1: {
        nome: 'João Silva',
        diaria: 100.00,
        dias: [
          { data: '2025-07-01', observacoes: 'Trabalho completo' },
          { data: '2025-07-02', observacoes: 'Trabalho manhã' },
          { data: '2025-07-03', observacoes: 'Trabalho tarde' },
          { data: '2025-07-04', observacoes: 'Trabalho completo' },
          { data: '2025-07-05', observacoes: 'Trabalho completo' }
        ]
      },
      2: {
        nome: 'Maria Santos',
        diaria: 120.00,
        dias: [
          { data: '2025-07-01', observacoes: 'Serviço especial' },
          { data: '2025-07-03', observacoes: 'Trabalho normal' },
          { data: '2025-07-04', observacoes: 'Trabalho normal' }
        ]
      },
      3: {
        nome: 'Carlos Oliveira',
        diaria: 90.00,
        dias: [
          { data: '2025-07-02', observacoes: 'Manutenção' },
          { data: '2025-07-04', observacoes: 'Limpeza' },
          { data: '2025-07-05', observacoes: 'Organização' },
          { data: '2025-07-06', observacoes: 'Trabalho geral' }
        ]
      }
    },
    periodo: {
      inicio: '01/07/2025',
      fim: '06/07/2025'
    },
    resumo: {
      totalFuncionarios: 1220.00, // 5*100 + 3*120 + 4*90 = 500 + 360 + 360 = 1220
      totalVeiculo: 420.00, // 6 dias * 70 por dia
      totalGeral: 1640.00, // 1220 + 420
      diasTrabalhados: 12 // Total de registros de trabalho
    }
  };
  
  gerarPDFDoRelatorio(dadosTeste, 'Relatório Teste PDF - Visual Melhorado');
};
