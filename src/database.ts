import sqlite3 from "sqlite3"
import { Database, open } from "sqlite"
import path from "path"

// Define User type
interface TelegramUser {
    telegramId: number
    firstName: string
    lastName: string
    joinedDate: string
    isSubscribed: boolean
}

interface CreateUserDto extends TelegramUser { }
interface UpdateUserDto extends Partial<Omit<TelegramUser, "telegramId">> { }

class TelegramUserService {
    private db: Database | null = null
    private readonly dbPath: string

    constructor() {
        // Create database in root directory
        this.dbPath = process.env.DB_PATH || path.join(process.cwd(), "data", "telegram_users.sqlite")
    }

    async initialize(): Promise<void> {
        try {
            this.db = await open({
                filename: this.dbPath,
                driver: sqlite3.Database
            })

            console.log("Successfully connected to SQLite database")
            await this.createTable()
        } catch (error) {
            console.error("Failed to initialize database:", error)
            throw error
        }
    }

    private async createTable(): Promise<void> {
        if (!this.db) throw new Error("Database not initialized")

        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS telegram_users (
                telegramId INTEGER PRIMARY KEY,
                firstName TEXT NOT NULL,
                lastName TEXT NOT NULL,
                joinedDate TEXT NOT NULL,
                isSubscribed INTEGER NOT NULL
            )
        `)
    }

    async getAllUsers(): Promise<TelegramUser[]> {
        if (!this.db) throw new Error("Database not initialized")

        const users = await this.db.all(`SELECT 
            telegramId,
            firstName,
            lastName,
            joinedDate,
            isSubscribed = 1 as isSubscribed
            FROM telegram_users`)

        return users
    }

    async createUser({ user }: { user: CreateUserDto }): Promise<TelegramUser | undefined> {
        if (!this.db) throw new Error("Database not initialized")

        await this.db.run(`
            INSERT INTO telegram_users (telegramId, firstName, lastName, joinedDate, isSubscribed)
            VALUES (?, ?, ?, ?, ?)`,
            [user.telegramId, user.firstName, user.lastName, user.joinedDate, user.isSubscribed ? 1 : 0]
        )

        return this.findUserByTelegramId({ telegramId: user.telegramId })
    }

    async updateUser({ telegramId, updateData }: { telegramId: number, updateData: UpdateUserDto }): Promise<TelegramUser | undefined> {
        if (!this.db) throw new Error("Database not initialized")

        // Build dynamic update query based on provided fields
        const updates = Object.entries(updateData)
            .filter(([_, value]) => value !== undefined)
            .map(([key, value]) => {
                if (key === "isSubscribed") {
                    return `${key} = ${value ? 1 : 0}`
                }
                return `${key} = "${value}"`
            })

        if (updates.length === 0) {
            throw new Error("No fields to update")
        }

        await this.db.run(`
            UPDATE telegram_users 
            SET ${updates.join(", ")}
            WHERE telegramId = ?`,
            telegramId
        )

        return this.findUserByTelegramId({ telegramId: telegramId })
    }

    async findUserByTelegramId({ telegramId }: { telegramId: number }): Promise<TelegramUser | undefined> {
        if (!this.db) throw new Error("Database not initialized")

        const user: TelegramUser | undefined = await this.db.get(`
            SELECT 
                telegramId,
                firstName,
                lastName,
                joinedDate,
                isSubscribed = 1 as isSubscribed
            FROM telegram_users 
            WHERE telegramId = ?`,
            telegramId
        )

        return user
    }

    async close(): Promise<void> {
        if (this.db) {
            await this.db.close()
            this.db = null
            console.log("Database connection closed")
        }
    }
}

export default TelegramUserService
