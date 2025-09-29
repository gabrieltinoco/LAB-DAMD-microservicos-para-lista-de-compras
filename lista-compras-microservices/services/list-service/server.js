// services/list-service/server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const axios = require('axios');

const JsonDatabase = require('../../shared/JsonDatabase');
const serviceRegistry = require('../../shared/serviceRegistry');

class ListService {
    constructor() {
        this.app = express();
        this.port = 3002;
        this.serviceName = 'list-service';
        this.serviceUrl = `http://127.0.0.1:${this.port}`;

        this.setupDatabase();
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupDatabase() {
        const dbPath = path.join(__dirname, 'database');
        this.listsDb = new JsonDatabase(dbPath, 'lists');
        console.log('List Service: Banco NoSQL inicializado');
    }

    setupMiddleware() {
        this.app.use(helmet());
        this.app.use(cors());
        this.app.use(morgan('combined'));
        this.app.use(express.json());
    }

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
                req.user = response.data.data.user;
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

        this.app.use(this.authMiddleware.bind(this));

        // Rotas para Listas
        this.app.post('/lists', this.createList.bind(this));
        this.app.get('/lists', this.getUserLists.bind(this));
        this.app.get('/lists/:id', this.getListById.bind(this));
        this.app.put('/lists/:id', this.updateList.bind(this));
        this.app.delete('/lists/:id', this.deleteList.bind(this));
        this.app.get('/lists/:id/summary', this.getListSummary.bind(this));

        // Rotas para Itens dentro da Lista
        this.app.post('/lists/:id/items', this.addItemToList.bind(this));
        this.app.put('/lists/:id/items/:itemId', this.updateItemInList.bind(this));
        this.app.delete('/lists/:id/items/:itemId', this.removeItemFromList.bind(this));
    }

    // --- Lógica de Negócio Auxiliar ---

    calculateSummary(items) {
        const totalItems = items.length;
        const purchasedItems = items.filter(item => item.purchased).length;
        const estimatedTotal = items.reduce((sum, item) => sum + (item.estimatedPrice * item.quantity), 0);
        return { totalItems, purchasedItems, estimatedTotal: parseFloat(estimatedTotal.toFixed(2)) };
    }

    // --- Controladores de Rota ---

    async createList(req, res) {
        try {
            const { name, description } = req.body;
            if (!name) return res.status(400).json({ success: false, message: 'O nome da lista é obrigatório' });

            const newList = await this.listsDb.create({
                id: uuidv4(),
                userId: req.user.id,
                name,
                description: description || '',
                status: 'active',
                items: [],
                summary: { totalItems: 0, purchasedItems: 0, estimatedTotal: 0 }
            });
            res.status(201).json({ success: true, data: newList });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Erro ao criar lista' });
        }
    }

    async getUserLists(req, res) {
        const lists = await this.listsDb.find({ userId: req.user.id });
        res.json({ success: true, data: lists });
    }

    async getListById(req, res) {
        const list = await this.listsDb.findById(req.params.id);
        if (!list) return res.status(404).json({ success: false, message: 'Lista não encontrada' });
        if (list.userId !== req.user.id) return res.status(403).json({ success: false, message: 'Acesso negado' });
        res.json({ success: true, data: list });
    }

    async updateList(req, res) {
        const list = await this.listsDb.findById(req.params.id);
        if (!list || list.userId !== req.user.id) return res.status(404).json({ success: false, message: 'Lista não encontrada ou acesso negado' });

        const { name, description, status } = req.body;
        const updatedList = await this.listsDb.update(req.params.id, { name, description, status });
        res.json({ success: true, data: updatedList });
    }

    async deleteList(req, res) {
        const list = await this.listsDb.findById(req.params.id);
        if (!list || list.userId !== req.user.id) return res.status(404).json({ success: false, message: 'Lista não encontrada ou acesso negado' });

        await this.listsDb.delete(req.params.id);
        res.status(204).send();
    }

    async getListSummary(req, res) {
        const list = await this.listsDb.findById(req.params.id);
        if (!list || list.userId !== req.user.id) return res.status(404).json({ success: false, message: 'Lista não encontrada ou acesso negado' });
        res.json({ success: true, data: list.summary });
    }

    async addItemToList(req, res) {
        try {
            const list = await this.listsDb.findById(req.params.id);
            if (!list || list.userId !== req.user.id) return res.status(404).json({ success: false, message: 'Lista não encontrada ou acesso negado' });

            const { itemId, quantity, notes } = req.body;
            if (!itemId || !quantity) return res.status(400).json({ success: false, message: 'itemId e quantity são obrigatórios' });

            // ** Comunicação com o Item Service para buscar dados do item **
            const itemService = serviceRegistry.discover('item-service');
            const itemResponse = await axios.get(`${itemService.url}/items/${itemId}`);
            const itemDetails = itemResponse.data.data;

            if (!itemDetails) return res.status(404).json({ success: false, message: 'Item do catálogo não encontrado' });

            const newItem = {
                itemId: itemDetails.id,
                itemName: itemDetails.name, // Cache do nome
                quantity: parseFloat(quantity),
                unit: itemDetails.unit,
                estimatedPrice: itemDetails.averagePrice,
                purchased: false,
                notes: notes || '',
                addedAt: new Date().toISOString()
            };

            list.items.push(newItem);
            list.summary = this.calculateSummary(list.items);

            const updatedList = await this.listsDb.update(list.id, { items: list.items, summary: list.summary });
            res.status(201).json({ success: true, data: updatedList });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Erro ao adicionar item à lista', error: error.message });
        }
    }

    async updateItemInList(req, res) {
        const list = await this.listsDb.findById(req.params.id);
        if (!list || list.userId !== req.user.id) return res.status(404).json({ success: false, message: 'Lista não encontrada ou acesso negado' });

        const itemIndex = list.items.findIndex(item => item.itemId === req.params.itemId);
        if (itemIndex === -1) return res.status(404).json({ success: false, message: 'Item não encontrado na lista' });

        const { quantity, purchased, notes } = req.body;
        if (quantity !== undefined) list.items[itemIndex].quantity = parseFloat(quantity);
        if (purchased !== undefined) list.items[itemIndex].purchased = purchased;
        if (notes !== undefined) list.items[itemIndex].notes = notes;

        list.summary = this.calculateSummary(list.items);

        const updatedList = await this.listsDb.update(list.id, { items: list.items, summary: list.summary });
        res.json({ success: true, data: updatedList });
    }

    async removeItemFromList(req, res) {
        const list = await this.listsDb.findById(req.params.id);
        if (!list || list.userId !== req.user.id) return res.status(404).json({ success: false, message: 'Lista não encontrada ou acesso negado' });

        const initialLength = list.items.length;
        list.items = list.items.filter(item => item.itemId !== req.params.itemId);

        if (list.items.length === initialLength) return res.status(404).json({ success: false, message: 'Item não encontrado na lista' });

        list.summary = this.calculateSummary(list.items);

        const updatedList = await this.listsDb.update(list.id, { items: list.items, summary: list.summary });
        res.json({ success: true, data: updatedList });
    }

    start() {
        this.app.listen(this.port, () => {
            console.log(`=====================================`);
            console.log(`List Service iniciado na porta ${this.port}`);
            serviceRegistry.register(this.serviceName, { url: this.serviceUrl });
            setInterval(() => serviceRegistry.updateHealth(this.serviceName, true), 30000);
            console.log(`=====================================`);
        });
    }
}

if (require.main === module) {
    const listService = new ListService();
    listService.start();
}