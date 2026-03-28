var express = require("express");
var router = express.Router();
let { uploadImage, uploadExcel } = require('../utils/uploadHandler')
let path = require('path')
let exceljs = require('exceljs')
let categoryModel = require('../schemas/categories')
let productModel = require('../schemas/products')
let inventoryModel = require('../schemas/inventories')
let userModel = require('../schemas/users')
let roleModel = require('../schemas/roles')
let crypto = require('crypto')
let { SendImportedUserPassword } = require('../utils/mailHandler')
let mongoose = require('mongoose')
let slugify = require('slugify')

function getCellText(cellValue) {
    if (cellValue === null || cellValue === undefined) {
        return ""
    }
    if (typeof cellValue === 'object') {
        if (cellValue.text) {
            return String(cellValue.text).trim()
        }
        if (cellValue.richText) {
            return cellValue.richText.map(item => item.text).join('').trim()
        }
        if (cellValue.result) {
            return String(cellValue.result).trim()
        }
    }
    return String(cellValue).trim()
}

function generateRandomPassword(length = 16) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}'
    let password = ''
    for (let i = 0; i < length; i++) {
        const randomIndex = crypto.randomInt(0, chars.length)
        password += chars[randomIndex]
    }
    return password
}

router.get('/:filename', function (req, res, next) {
    let pathFile = path.join(__dirname, '../uploads', req.params.filename)
    res.sendFile(pathFile)
})

router.post('/one_file', uploadImage.single('file'), function (req, res, next) {
    if (!req.file) {
        res.status(404).send({
            message: "file khong duoc de trong"
        })
        return
    }
    res.send({
        filename: req.file.filename,
        path: req.file.path,
        size: req.file.size
    })
})
router.post('/multiple_file', uploadImage.array('files'), function (req, res, next) {
    if (!req.files) {
        res.status(404).send({
            message: "file khong duoc de trong"
        })
        return
    }
    res.send(req.files.map(f => {
        return {
            filename: f.filename,
            path: f.path,
            size: f.size
        }
    }))
})
router.post('/excel', uploadExcel.single('file'), async function (req, res, next) {
    //workbook->worksheet->row/column->cell
    let workbook = new exceljs.Workbook();
    let pathFile = path.join(__dirname, '../uploads', req.file.filename)
    await workbook.xlsx.readFile(pathFile);
    let worksheet = workbook.worksheets[0];
    let categories = await categoryModel.find({});
    let categoryMap = new Map()
    for (const category of categories) {
        categoryMap.set(category.name, category._id)
    }
    let products = await productModel.find({});
    let getTitle = products.map(p => p.title)
    let getSku = products.map(p => p.sku)
    let result = [];
    for (let row = 2; row <= worksheet.rowCount; row++) {
        let errorsInRow = [];
        const contentRow = worksheet.getRow(row);
        let sku = contentRow.getCell(1).value;
        let title = contentRow.getCell(2).value;
        let category = contentRow.getCell(3).value;
        let price = Number.parseInt(contentRow.getCell(4).value);
        let stock = Number.parseInt(contentRow.getCell(5).value);
        if (price < 0 || isNaN(price)) {
            errorsInRow.push("price pahi la so duong")
        }
        if (stock < 0 || isNaN(stock)) {
            errorsInRow.push("stock pahi la so duong")
        }
        if (!categoryMap.has(category)) {
            errorsInRow.push("category khong hop le")
        }
        if (getTitle.includes(title)) {
            errorsInRow.push("Title da ton tai")
        }
        if (getSku.includes(sku)) {
            errorsInRow.push("sku da ton tai")
        }
        if (errorsInRow.length > 0) {
            result.push(errorsInRow)
            continue;
        }
        let session = await mongoose.startSession();
        session.startTransaction()
        try {
            let newProduct = new productModel({
                sku: sku,
                title: title,
                slug: slugify(title,
                    {
                        replacement: '-',
                        remove: undefined,
                        lower: true,
                        trim: true
                    }
                ), price: price,
                description: title,
                category: categoryMap.get(category)
            })
            await newProduct.save({ session });

            let newInventory = new inventoryModel({
                product: newProduct._id,
                stock: stock
            })
            await newInventory.save({ session });
            await newInventory.populate('product')
            await session.commitTransaction()
            await session.endSession()
            getTitle.push(newProduct.title)
            getSku.push(newProduct.sku)
            result.push(newInventory)
        } catch (error) {
            await session.abortTransaction()
            await session.endSession()
            res.push(error.message)
        }

    }
    res.send(result)
})

router.post('/excel/users', uploadExcel.any(), async function (req, res, next) {
    const uploadedFile = (req.file) || (Array.isArray(req.files) && req.files.length > 0 ? req.files[0] : null)

    if (!uploadedFile) {
        res.status(400).send({
            message: 'file khong duoc de trong'
        })
        return
    }

    let roleUser = await roleModel.findOne({
        name: 'user',
        isDeleted: false
    })

    if (!roleUser) {
        res.status(400).send({
            message: "khong tim thay role 'user'"
        })
        return
    }

    let workbook = new exceljs.Workbook();
    let pathFile = path.join(__dirname, '../uploads', uploadedFile.filename)
    await workbook.xlsx.readFile(pathFile);
    let worksheet = workbook.worksheets[0];

    const existedUsers = await userModel.find({}, { username: 1, email: 1 })
    const existedUsernameSet = new Set(existedUsers.map(item => item.username))
    const existedEmailSet = new Set(existedUsers.map(item => item.email))

    const batchUsernameSet = new Set()
    const batchEmailSet = new Set()
    const result = []

    for (let row = 2; row <= worksheet.rowCount; row++) {
        const contentRow = worksheet.getRow(row)
        const username = getCellText(contentRow.getCell(1).value)
        const email = getCellText(contentRow.getCell(2).value).toLowerCase()
        const errorsInRow = []

        if (!username) {
            errorsInRow.push('username khong duoc de trong')
        }
        if (!email) {
            errorsInRow.push('email khong duoc de trong')
        }
        if (email && !/^\S+@\S+\.\S+$/.test(email)) {
            errorsInRow.push('email khong hop le')
        }
        if (username && (existedUsernameSet.has(username) || batchUsernameSet.has(username))) {
            errorsInRow.push('username da ton tai')
        }
        if (email && (existedEmailSet.has(email) || batchEmailSet.has(email))) {
            errorsInRow.push('email da ton tai')
        }

        if (errorsInRow.length > 0) {
            result.push({
                row: row,
                username: username,
                email: email,
                status: 'failed',
                errors: errorsInRow
            })
            continue
        }

        const plainPassword = generateRandomPassword(16)
        const newUser = new userModel({
            username: username,
            email: email,
            password: plainPassword,
            role: roleUser._id
        })

        try {
            await newUser.save()
            await SendImportedUserPassword(email, username, plainPassword)

            existedUsernameSet.add(username)
            existedEmailSet.add(email)
            batchUsernameSet.add(username)
            batchEmailSet.add(email)

            result.push({
                row: row,
                username: username,
                email: email,
                role: 'user',
                status: 'success'
            })
        } catch (error) {
            result.push({
                row: row,
                username: username,
                email: email,
                status: 'failed',
                errors: [error.message]
            })
        }
    }

    res.send({
        total: result.length,
        success: result.filter(item => item.status === 'success').length,
        failed: result.filter(item => item.status === 'failed').length,
        items: result
    })
})

module.exports = router