import express from 'express'
import pg from 'pg'
import Joi from 'joi'

const app = express()
const port = 3000
const { Pool } = pg

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'mahasiswa',
    password: 'apasaja',
    port: 5432,
})

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// ==========================================
// MIDDLEWARE: Request Logger
// ==========================================
app.use((req, res, next) => {
    const start = Date.now()

    res.on('finish', () => {
        const duration = Date.now() - start

        console.log({
            method: req.method,
            url: req.originalUrl,
            status: res.statusCode,
            duration: `${duration}ms`,
        })
    })

    next()
})

// ==========================================
// RESPONSE ENVELOPE
// ==========================================
function successResponse(res, message, data, status = 200) {
    return res.status(status).json({
        success: true,
        message,
        data,
        error: null,
    })
}

function errorResponse(res, message, status, details = null) {
    return res.status(status).json({
        success: false,
        message,
        data: null,
        error: details,
    })
}

// ==========================================
// JOI VALIDATION SCHEMAS
// ==========================================
const biodataSchema = Joi.object({
    id: Joi.number().integer().positive(),
    nama: Joi.string().trim().min(2).max(100).required(),
    nim: Joi.string().trim().min(5).max(20).required(),
    kelas: Joi.string().trim().min(1).max(20).required(),
})

const idSchema = Joi.object({
    id: Joi.number().integer().positive().required(),
})

// Middleware untuk validasi body
function validateBody(schema) {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.body, {
            abortEarly: false, 
            convert: true, 
            allowUnknown: false,
        })

        if (error) {
            return errorResponse(
                res,
                'Validasi input gagal',
                400,
                error.details.map(item => ({
                    field: item.path.join('.'),
                    message: item.message,
                }))
            )
        }
        req.body = value
        next()
    }
}

// Middleware untuk validasi parameter id
function validateIdParam(schema) {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.params)

        if (error) {
            return errorResponse(
                res,
                'Parameter tidak valid',
                400,
                error.details.map(item => ({
                    field: item.path.join('.'),
                    message: item.message,
                }))
            )
        }

        req.params = value
        next()
    }
}

// ==========================================
// ROUTES (CRUD)
// ==========================================

// GET: Mengambil semua data biodata
app.get('/', async (req, res, next) => {
    try {
        const result = await pool.query(
            'SELECT * FROM biodata ORDER BY id'
        )

        return successResponse(
            res,
            'Data berhasil diambil',
            result.rows
        )
    } catch (err) {
        next(err)
    }
})

// POST: Menambahkan data biodata baru
app.post(
    '/biodata',
    validateBody(biodataSchema),
    async (req, res, next) => {
        try {
            const { id, nama, nim, kelas } = req.body

            const result = await pool.query(
                'INSERT INTO biodata (id, nama, nim, kelas) VALUES ($1, $2, $3, $4) RETURNING *',
                [id ?? null, nama, nim, kelas]
            )

            return successResponse(
                res,
                'Data berhasil ditambahkan',
                result.rows[0],
                201
            )
        } catch (err) {
            next(err)
        }
    }
)

// PUT: Mengubah data biodata berdasarkan ID
app.put(
    '/biodata/:id',
    validateIdParam(idSchema),
    validateBody(biodataSchema.fork(
        ['nama', 'nim', 'kelas'],
        field => field.required()
    ).fork(['id'], field => field.forbidden())),
    async (req, res, next) => {
        try {
            const { id } = req.params
            const { nama, nim, kelas } = req.body

            const result = await pool.query(
                'UPDATE biodata SET nama = $1, nim = $2, kelas = $3 WHERE id = $4 RETURNING *',
                [nama, nim, kelas, id]
            )

            if (result.rowCount === 0) {
                return errorResponse(
                    res, 'Data tidak ditemukan', 404
                )
            }

            return successResponse(
                res,
                'Data berhasil diubah',
                result.rows[0]
            )
        } catch (err) {
            next(err)
        }
    }
)

// DELETE: Menghapus data biodata berdasarkan ID
app.delete(
    '/biodata/:id',
    validateIdParam(idSchema),
    async (req, res, next) => {
        try {
            const { id } = req.params

            const result = await pool.query(
                'DELETE FROM biodata WHERE id = $1 RETURNING *',
                [id]
            )

            if (result.rowCount === 0) {
                return errorResponse(
                    res, 'Data tidak ditemukan', 404
                )
            }

            return successResponse(
                res,
                'Data berhasil dihapus',
                result.rows[0]
            )
        } catch (err) {
            next(err)
        }
    }
)

// ==========================================
// ROUTE TIDAK DITEMUKAN (404)
// ==========================================
app.use((req, res) => {
    return errorResponse(
        res,
        'Endpoint tidak ditemukan',
        404
    )
})

// ==========================================
// GLOBAL ERROR HANDLER
// ==========================================
app.use((err, req, res, next) => {
    console.error(err)

    if (res.headersSent) {
        return next(err)
    }

    return errorResponse(
        res,
        'Terjadi kesalahan pada server',
        500,
        err.message
    )
})

