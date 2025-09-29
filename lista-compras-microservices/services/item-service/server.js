// services/item-service/server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const axios = require('axios');

const JsonDatabase = require('../../shared/JsonDatabase');
const serviceRegistry = require('../../shared/serviceRegistry');

class ItemService {
    constructor() {
        this.app = express();
        this.port = 3003;
        this.serviceName = 'item-service';
        this.serviceUrl = `http://127.0.0.1:${this.port}`;
        
        this.setupDatabase();
        this.setupMiddleware();
        this.setupRoutes();
        this.seedInitialData();
    }

    setupDatabase() {
        const dbPath = path.join(__dirname, 'database');
        this.itemsDb = new JsonDatabase(dbPath, 'items');
        console.log('Item Service: Banco NoSQL inicializado');
    }

    async seedInitialData() {
        try {
            const items = await this.itemsDb.find();
            if (items.length === 0) {
                console.log('Nenhum item encontrado, populando o banco de dados inicial...');
                const initialItems = [
                    // Alimentos
                    { name: 'Arroz Branco Tipo 1', category: 'Alimentos', brand: 'Tio João', unit: 'kg', averagePrice: 5.50, barcode: '7896006700018', active: true },
                    { name: 'Feijão Carioca', category: 'Alimentos', brand: 'Camil', unit: 'kg', averagePrice: 8.00, barcode: '7896006700025', active: true },
                    { name: 'Óleo de Soja', category: 'Alimentos', brand: 'Liza', unit: 'litro', averagePrice: 7.20, barcode: '7896006700032', active: true },
                    { name: 'Macarrão Espaguete', category: 'Alimentos', brand: 'Barilla', unit: '500g', averagePrice: 6.50, barcode: '7896006700049', active: true },
                    { name: 'Molho de Tomate Tradicional', category: 'Alimentos', brand: 'Heinz', unit: 'un', averagePrice: 3.80, barcode: '7896006700056', active: true },
                    // Limpeza
                    { name: 'Detergente Líquido Limão', category: 'Limpeza', brand: 'Ypê', unit: '500ml', averagePrice: 2.50, barcode: '7896006700063', active: true },
                    { name: 'Sabão em Pó', category: 'Limpeza', brand: 'Omo', unit: 'kg', averagePrice: 15.00, barcode: '7896006700070', active: true },
                    { name: 'Água Sanitária', category: 'Limpeza', brand: 'Qboa', unit: 'litro', averagePrice: 4.00, barcode: '7896006700087', active: true },
                    { name: 'Amaciante de Roupas', category: 'Limpeza', brand: 'Downy', unit: 'litro', averagePrice: 20.00, barcode: '7896006700094', active: true },
                    { name: 'Desinfetante Pinho', category: 'Limpeza', brand: 'Pinho Sol', unit: 'litro', averagePrice: 9.50, barcode: '7896006700100', active: true },
                    // Higiene
                    { name: 'Sabonete em Barra', category: 'Higiene', brand: 'Dove', unit: 'un', averagePrice: 3.00, barcode: '7896006700117', active: true },
                    { name: 'Shampoo Hidratação', category: 'Higiene', brand: 'Pantene', unit: '400ml', averagePrice: 22.00, barcode: '7896006700124', active: true },
                    { name: 'Creme Dental', category: 'Higiene', brand: 'Colgate', unit: '90g', averagePrice: 4.50, barcode: '7896006700131', active: true },
                    { name: 'Papel Higiênico Folha Dupla', category: 'Higiene', brand: 'Neve', unit: '4 un', averagePrice: 8.00, barcode: '7896006700148', active: true },
                    { name: 'Desodorante Aerosol', category: 'Higiene', brand: 'Rexona', unit: 'un', averagePrice: 16.00, barcode: '7896006700155', active: true },
                    // Bebidas
                    { name: 'Refrigerante Cola', category: 'Bebidas', brand: 'Coca-Cola', unit: '2L', averagePrice: 9.00, barcode: '7896006700162', active: true },
                    { name: 'Suco de Laranja Integral', category: 'Bebidas', brand: 'Natural One', unit: 'litro', averagePrice: 12.00, barcode: '7896006700179', active: true },
                    { name: 'Água Mineral sem Gás', category: 'Bebidas', brand: 'Minalba', unit: '1.5L', averagePrice: 3.00, barcode: '7896006700186', active: true },
                    { name: 'Cerveja Pilsen', category: 'Bebidas', brand: 'Heineken', unit: 'long neck', averagePrice: 6.50, barcode: '7896006700193', active: true },
                    // Padaria
                    { name: 'Pão de Forma Tradicional', category: 'Padaria', brand: 'Pullman', unit: 'un', averagePrice: 7.50, barcode: '7896006700209', active: true },
                    { name: 'Biscoito Cream Cracker', category: 'Padaria', brand: 'Tostines', unit: '200g', averagePrice: 4.00, barcode: '7896006700216', active: true },
                ];
                for (const item of initialItems) {
                    await this.itemsDb.create({ id: uuidv4(), ...item });
                }
                console.log(`${initialItems.length} itens criados com sucesso!`);
            }
        } catch (error) {
            console.error('Erro ao popular dados iniciais do Item Service:', error);
        }
    }

    setupMiddleware() {
        this.app.use(helmet());
        this.app.use(cors());
        this.app.use(morgan('combined'));
        this.app.use(express.json());
    }

    // Middleware para validar token com o User Service
    async authMiddleware(req, res, next) {
        const authHeader = req.header('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, message: 'Token obrigatório' });
        }
        try {
            const userService = serviceRegistry.discover('user-service');
            const token = authHeader.replace('Bearer ', '');
            const response = await axios.post(`${userService.url}/auth/validate`, { token });

            if (response.data.success) {
                req.user = response.data.data.user; // Anexa o usuário na requisição
                next();
            } else {
                res.status(401).json({ success: false, message: 'Token inválido' });
            }
        } catch (error) {
            console.error('Erro na validação do token:', error.message);
            res.status(503).json({ success: false, message: 'Serviço de autenticação indisponível' });
        }
    }

    setupRoutes() {
        this.app.get('/health', (req, res) => res.json({ service: this.serviceName, status: 'healthy' }));
        
        // Endpoints públicos
        this.app.get('/items', this.getItems.bind(this));
        this.app.get('/items/:id', this.getItem.bind(this));
        this.app.get('/categories', this.getCategories.bind(this));
        this.app.get('/search', this.searchItems.bind(this));
        
        // Endpoints protegidos
        this.app.post('/items', this.authMiddleware.bind(this), this.createItem.bind(this));
        this.app.put('/items/:id', this.authMiddleware.bind(this), this.updateItem.bind(this));
    }

    async getItems(req, res) {
        try {
            const { category, name } = req.query;
            const filter = { active: true };
            if (category) filter.category = category;
            // Para busca por nome, usamos regex para "conter" o texto
            if (name) filter.name = { $regex: name, $options: 'i' };

            const items = await this.itemsDb.find(filter);
            res.json({ success: true, data: items });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Erro ao buscar itens' });
        }
    }

    async getItem(req, res) {
        const item = await this.itemsDb.findById(req.params.id);
        if (!item) return res.status(404).json({ success: false, message: 'Item não encontrado' });
        res.json({ success: true, data: item });
    }

    async createItem(req, res) {
        try {
            const { name, category, brand, unit, averagePrice } = req.body;
            if (!name || !category || !unit || !averagePrice) {
                return res.status(400).json({ success: false, message: 'Campos obrigatórios: name, category, unit, averagePrice' });
            }
            const newItemData = { ...req.body, id: uuidv4(), active: true };
            const newItem = await this.itemsDb.create(newItemData);
            res.status(201).json({ success: true, data: newItem });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Erro ao criar item' });
        }
    }

    async updateItem(req, res) {
        const updatedItem = await this.itemsDb.update(req.params.id, req.body);
        if (!updatedItem) return res.status(404).json({ success: false, message: 'Item não encontrado' });
        res.json({ success: true, data: updatedItem });
    }

    async getCategories(req, res) {
        try {
            const items = await this.itemsDb.find({ active: true });
            const categories = [...new Set(items.map(item => item.category))].sort();
            res.json({ success: true, data: categories });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Erro ao buscar categorias' });
        }
    }

    async searchItems(req, res) {
        try {
            const { q } = req.query;
            if (!q) return res.status(400).json({ success: false, message: 'Parâmetro de busca "q" é obrigatório' });
            
            const results = await this.itemsDb.search(q, ['name', 'brand', 'category']);
            res.json({ success: true, data: results.filter(item => item.active) });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Erro na busca' });
        }
    }

    start() {
        this.app.listen(this.port, () => {
            console.log(`=====================================`);
            console.log(`Item Service iniciado na porta ${this.port}`);
            serviceRegistry.register(this.serviceName, { url: this.serviceUrl });
            setInterval(() => serviceRegistry.updateHealth(this.serviceName, true), 30000);
            console.log(`=====================================`);
        });
    }
}

if (require.main === module) {
    const itemService = new ItemService();
    itemService.start();
}