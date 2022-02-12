#!/usr/bin/env node

import { promises as fs } from 'fs'
import * as path from 'path'
import * as yargs from 'yargs'
import { table } from 'table'
import { utimes } from 'utimes';

import { SESv2Client, ListEmailTemplatesCommand, GetEmailTemplateCommand, DimensionValueSource } from '@aws-sdk/client-sesv2';
const getClient = (region: string = 'us-east-1') => {
    return new SESv2Client({ region })
}

const listTemplates = (client: SESv2Client) =>
    client.send(new ListEmailTemplatesCommand({}))
        .then((data) =>
        (data.TemplatesMetadata?.map(({ TemplateName, CreatedTimestamp }) => ({
            name: TemplateName,
            createdAt: CreatedTimestamp
        })) || []))


const getTemplate = (client: SESv2Client, name: string) => {
    return client.send(new GetEmailTemplateCommand({
        TemplateName: name
    })).then(({ TemplateContent, TemplateName }) => ({
        name: TemplateName,
        content: TemplateContent
    }))
}

const options = yargs
    .scriptName('stu')
    .command('list', 'List templates found in the current region', (yargs) => {

    }, async (argv) => {
        const client = getClient()
        const data = (await listTemplates(client)).map(({ name, createdAt }) => [name, createdAt])
        if (data) {
            console.log(table(data, {
                header: {
                    content: 'Templates',
                    alignment: 'left'
                }
            }))
        }
    })
    .command<{ name: string }>('get [name]', 'Get template by name', (yargs) => {
        yargs.positional('name', {
            type: 'string',
            describe: 'Template find'
        })
    }, async (argv) => {
        const client = getClient()
        const data = await getTemplate(client, argv.name)
        console.log(data.content)
    })
    .command<{ separator: string, dir: string }>('pull [dir]', 'Pull templates locally', (yargs) => {
        yargs.option('separator', {
            type: 'string',
            default: '_',
            describe: 'Character(s) to treat as directory separator'
        }).positional('dir', {
            type: 'string',
            default: '.',
            describe: 'Directory to treat as base when recreating hierarchy'
        })
    }, async (argv) => {

        const client = getClient()
        const templates = await listTemplates(client)

        await Promise.all(templates.map(async ({ name, createdAt }) => {
            const data = await getTemplate(client, name!)
            const [top, ...dirs] = name!.split(argv.separator).reverse()
            const filePath = `${argv.dir}${path.sep}${name!.split(argv.separator).join(path.sep)}.html`
            await fs.mkdir(`${argv.dir}${path.sep}${dirs.reverse().join(path.sep)}`, { recursive: true })
            await fs.writeFile(filePath, `<!--
name: ${name}
-->
${data.content?.Html}`, { flag: 'w' })
            await utimes(filePath, {
                btime: createdAt!.getTime(),
                atime: createdAt!.getTime(),
                mtime: createdAt!.getTime()
            } )
        }))
    })
    .help().argv