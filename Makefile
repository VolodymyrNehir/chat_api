-include .env
export

.DEFAULT_GOAL := help
COMPOSE := docker compose

help: ## Show available targets
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

up: ## Build and start the database and the API
	$(COMPOSE) up -d --build

down: ## Stop containers, keep the data volume
	$(COMPOSE) down

reset: ## Stop containers and delete the data volume
	$(COMPOSE) down -v

logs: ## Follow the API logs
	$(COMPOSE) logs -f api

ps: ## Show service status
	$(COMPOSE) ps

migrate: ## Run migrations inside the api container
	$(COMPOSE) exec api npm run migration:run:prod

migration: ## Generate a migration: make migration name=add_x
	npm run migration:generate -- src/migrations/$(name)

test: ## Run unit tests
	npm test

db: ## Open psql in the database container
	$(COMPOSE) exec db psql -U $${POSTGRES_USER} -d $${POSTGRES_DB}

sh: ## Open a shell in the api container
	$(COMPOSE) exec api sh

dev: ## Start only the database, run the app locally with hot reload
	$(COMPOSE) up -d db
	npm run start:dev

.PHONY: help up down reset logs ps migrate migration test db sh dev
