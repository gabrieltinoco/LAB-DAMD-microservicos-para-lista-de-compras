// api-gateway/server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const axios = require('axios');

const serviceRegistry = require('../shared/serviceRegistry');

class APIGateway {
    constructor() {
        this.app = express();
        this.port = 3000;
        this.circuitBreakers = new Map();
        
        this.setupMiddleware();
        this.setupRoutes();
        this.startHealthChecks();
    }

    setupMiddleware() {
        this.app.use(helmet());
        this.app.use(cors());
        this.app.use(morgan('combined'));
        this.app.use(express.json());
    }

    setupRoutes() {
        // --- Endpoints do próprio Gateway ---
        this.app.get('/health', this.getGatewayHealth.bind(this));
        this.app.get('/registry', (req, res) => res.json(serviceRegistry.listServices()));

        // --- Roteamento para Microsserviços ---
        this.app.use('/api/auth', this.proxyRequest.bind(this, 'user-service', '/auth'));
        this.app.use('/api/users', this.proxyRequest.bind(this, 'user-service', '/users'));
        this.app.use('/api/items', this.proxyRequest.bind(this, 'item-service', '/items'));
        this.app.use('/api/lists', this.proxyRequest.bind(this, 'list-service', '/lists'));

        // --- Endpoints Agregados ---
        this.app.get('/api/dashboard', this.getDashboard.bind(this));
        this.app.get('/api/search', this.globalSearch.bind(this));
    }

    async proxyRequest(serviceName, serviceBasePath, req, res) {
        try {
            if (this.isCircuitOpen(serviceName)) {
                return res.status(503).json({ success: false, message: `Serviço ${serviceName} temporariamente indisponível` });
            }

            const service = serviceRegistry.discover(serviceName);
            const targetPath = req.originalUrl.replace(`/api${serviceBasePath}`, serviceBasePath);
            const targetUrl = `${service.url}${targetPath}`;
            
            console.log(`Proxying request to: ${req.method} ${targetUrl}`);

            const response = await axios({
                method: req.method,
                url: targetUrl,
                data: req.body,
                headers: { 'Authorization': req.header('Authorization') }
            });

            this.resetCircuitBreaker(serviceName);
            res.status(response.status).json(response.data);
        } catch (error) {
            this.recordFailure(serviceName);
            const status = error.response ? error.response.status : 503;
            const message = error.response ? error.response.data.message : `Serviço ${serviceName} indisponível`;
            res.status(status).json({ success: false, message });
        }
    }
    
    async getGatewayHealth(req, res) {
        res.json({
            service: 'api-gateway',
            status: 'healthy',
            services: serviceRegistry.getStats()
        });
    }

    async getDashboard(req, res) {
        try {
            const authHeader = req.header('Authorization');
            if (!authHeader) return res.status(401).json({ success: false, message: 'Token obrigatório' });

            const [listsResponse, itemsResponse] = await Promise.allSettled([
                this.callService('list-service', '/lists?limit=5', authHeader),
                this.callService('item-service', '/items?limit=5')
            ]);
            
            const dashboardData = {
                recentLists: listsResponse.status === 'fulfilled' ? listsResponse.value.data : [],
                catalogItems: itemsResponse.status === 'fulfilled' ? itemsResponse.value.data : []
            };
            
            res.json({ success: true, data: dashboardData });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Erro ao montar o dashboard' });
        }
    }
    
    async globalSearch(req, res) {
        try {
            const { q } = req.query;
            if (!q) return res.status(400).json({ success: false, message: 'Parâmetro de busca "q" é obrigatório' });

            // Busca apenas nos itens do catálogo, que é público
            const itemResults = await this.callService('item-service', `/search?q=${q}`);

            res.json({ success: true, data: { items: itemResults.data } });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Erro na busca global' });
        }
    }

    async callService(serviceName, path, authHeader = null) {
        const service = serviceRegistry.discover(serviceName);
        const headers = authHeader ? { 'Authorization': authHeader } : {};
        const response = await axios.get(`${service.url}${path}`, { headers });
        return response.data;
    }

    // --- Lógica do Circuit Breaker ---
    isCircuitOpen(serviceName) {
        const breaker = this.circuitBreakers.get(serviceName);
        if (!breaker) return false;
        // Se o circuito está aberto e o tempo de timeout passou, entra em "meio-aberto"
        if (breaker.isOpen && (Date.now() - breaker.lastFailure) > 30000) {
            breaker.isOpen = false; 
            console.log(`Circuit breaker for ${serviceName} is now half-open.`);
            return false;
        }
        return breaker.isOpen;
    }

    recordFailure(serviceName) {
        let breaker = this.circuitBreakers.get(serviceName);
        if (!breaker) {
            breaker = { failures: 0, isOpen: false, lastFailure: null };
            this.circuitBreakers.set(serviceName, breaker);
        }
        breaker.failures++;
        breaker.lastFailure = Date.now();
        if (breaker.failures >= 3) {
            breaker.isOpen = true;
            console.error(`Circuit breaker for ${serviceName} has been opened!`);
        }
    }

    resetCircuitBreaker(serviceName) {
        const breaker = this.circuitBreakers.get(serviceName);
        if (breaker) {
            breaker.failures = 0;
            breaker.isOpen = false;
        }
    }
    
    startHealthChecks() {
        setInterval(() => serviceRegistry.performHealthChecks(), 30000);
    }

    start() {
        this.app.listen(this.port, () => {
            console.log('=====================================');
            console.log(`API Gateway iniciado na porta ${this.port}`);
            console.log(`Ponto de entrada: http://127.0.0.1:${this.port}`);
            console.log('=====================================');
        });
    }
}

if (require.main === module) {
    const gateway = new APIGateway();
    gateway.start();
}