const Database = require('./database.js');
const fs = require('fs');
const path = require('path');

async function limparBanco() {
  console.log('🧹 Iniciando limpeza completa do sistema...');
  
  const db = new Database();
  
  try {
    // Limpar banco de dados
    console.log('📊 Limpando banco de dados...');
    const resultado = await db.limparBancoDados();
    console.log('✅ Banco limpo:', resultado.message);
    
    // Limpar arquivos de comprovantes
    console.log('📄 Limpando arquivos de comprovantes...');
    const comprovantesDir = path.join(__dirname, 'data', 'comprovantes');
    
    if (fs.existsSync(comprovantesDir)) {
      const funcionarios = fs.readdirSync(comprovantesDir);
      let arquivosRemovidos = 0;
      
      funcionarios.forEach(funcionario => {
        const funcionarioDir = path.join(comprovantesDir, funcionario);
        if (fs.statSync(funcionarioDir).isDirectory()) {
          const arquivos = fs.readdirSync(funcionarioDir);
          arquivos.forEach(arquivo => {
            fs.unlinkSync(path.join(funcionarioDir, arquivo));
            arquivosRemovidos++;
          });
          // Remover diretório vazio
          fs.rmdirSync(funcionarioDir);
        }
      });
      
      console.log(`✅ ${arquivosRemovidos} arquivos de comprovantes removidos`);
    }
    
    console.log('\n📋 Dados removidos:');
    console.log('   ✓ Todos os funcionários');
    console.log('   ✓ Todos os dias de trabalho');
    console.log('   ✓ Todos os comprovantes');
    console.log('   ✓ Todos os relatórios');
    console.log('   ✓ Todo o histórico mensal');
    console.log('   ✓ Todos os arquivos de comprovantes');
    console.log('   ✓ IDs resetados para começar do 1');
    console.log('\n🚀 O sistema está completamente limpo e pronto para novos testes!');
    
  } catch (error) {
    console.error('❌ Erro durante a limpeza:', error);
  } finally {
    db.close();
    console.log('\n📊 Conexão com banco fechada.');
  }
}

// Executar limpeza
limparBanco();
