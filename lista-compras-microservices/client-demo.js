// client-demo.js
const axios = require('axios');

class ShoppingListClient {
    constructor(gatewayUrl = 'http://127.0.0.1:3000') {
        this.api = axios.create({ baseURL: gatewayUrl, timeout: 10000 });
        this.authToken = null;

        this.api.interceptors.request.use(config => {
            if (this.authToken) {
                config.headers.Authorization = `Bearer ${this.authToken}`;
            }
            return config;
        });
    }

    logResponse(message, data) {
        console.log(`\n--- ${message} ---`);
        console.log(JSON.stringify(data, null, 2));
    }

    logError(message, error) {
        console.error(`\n--- ERRO: ${message} ---`);
        const errorData = error.response ? error.response.data : { message: error.message };
        console.error(JSON.stringify(errorData, null, 2));
    }

    async register(userData) {
        try {
            const response = await this.api.post('/api/auth/register', userData);
            console.log('\n✅ Usuário registrado com sucesso!');
            return response.data;
        } catch (error) {
            this.logError('Falha no registro', error);
            throw error;
        }
    }

    async login(credentials) {
        try {
            const response = await this.api.post('/api/auth/login', credentials);
            this.authToken = response.data.data.token;
            console.log(`\n✅ Login realizado com sucesso! Usuário: ${response.data.data.user.username}`);
            return response.data;
        } catch (error) {
            this.logError('Falha no login', error);
            throw error;
        }
    }

    async getItems(filter = '') {
        try {
            const response = await this.api.get(`/api/items${filter}`);
            console.log(`\n✅ Itens do catálogo encontrados!`);
            return response.data;
        } catch (error) {
            this.logError('Falha ao buscar itens', error);
            throw error;
        }
    }

    async createList(listData) {
        try {
            const response = await this.api.post('/api/lists', listData);
            console.log(`\n✅ Lista "${listData.name}" criada com sucesso!`);
            this.logResponse('Detalhes da Nova Lista', response.data.data);
            return response.data;
        } catch (error) {
            this.logError('Falha ao criar lista', error);
            throw error;
        }
    }

    async addItemToList(listId, itemData) {
        try {
            const response = await this.api.post(`/api/lists/${listId}/items`, itemData);
            console.log(`\n✅ Item adicionado à lista ${listId}!`);
            this.logResponse('Lista Atualizada', response.data.data);
            return response.data;
        } catch (error) {
            this.logError('Falha ao adicionar item', error);
            throw error;
        }
    }

    async getDashboard() {
        try {
            const response = await this.api.get('/api/dashboard');
            console.log('\n✅ Dashboard agregado recebido!');
            this.logResponse('Dados do Dashboard', response.data.data);
            return response.data;
        } catch (error) {
            this.logError('Falha ao buscar dashboard', error);
            throw error;
        }
    }

    async runDemo() {
        console.log('============================================');
        console.log('INICIANDO DEMONSTRAÇÃO DO SISTEMA DE COMPRAS');
        console.log('============================================');

        try {
            // 1. Registrar um novo usuário
            const uniqueId = Date.now();
            await this.register({
                email: `testuser${uniqueId}@pucminas.br`,
                username: `testuser${uniqueId}`,
                password: 'password123',
                firstName: 'Test',
                lastName: 'User'
            });

            // 2. Fazer login para obter o token
            await this.login({
                identifier: `testuser${uniqueId}`,
                password: 'password123'
            });

            // 3. Buscar alguns itens do catálogo (público)
            const itemsResult = await this.getItems('?category=Alimentos');
            const arroz = itemsResult.data.find(item => item.name.includes('Arroz'));
            const feijao = itemsResult.data.find(item => item.name.includes('Feijão'));

            if (!arroz || !feijao) {
                console.error('Itens de exemplo (arroz, feijão) não encontrados no seed. Verifique o Item Service.');
                return;
            }
            console.log(`\nItens para adicionar: ${arroz.name} (ID: ${arroz.id}), ${feijao.name} (ID: ${feijao.id})`);

            // 4. Criar uma nova lista de compras (autenticado)
            const newListResult = await this.createList({
                name: 'Compras da Semana',
                description: 'Itens essenciais para a cozinha'
            });
            const listId = newListResult.data.id;

            // 5. Adicionar itens à lista criada
            await this.addItemToList(listId, {
                itemId: arroz.id,
                quantity: 1
            });
            await this.addItemToList(listId, {
                itemId: feijao.id,
                quantity: 2,
                notes: 'Verificar a marca'
            });
            
            // 6. Buscar o dashboard agregado
            await this.getDashboard();

            console.log('\n============================================');
            console.log('🎉 DEMONSTRAÇÃO CONCLUÍDA COM SUCESSO!');
            console.log('============================================');

        } catch (error) {
            console.error('\n❌ A demonstração falhou.');
        }
    }
}

// Executar a demonstração
const client = new ShoppingListClient();
client.runDemo();
