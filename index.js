const fs = require('fs')
const readline = require('readline')

const mappingsFile = process.argv[2]
const inputFile = process.argv[3]
const outputFile = process.argv[4]

async function processMappings(mappingsStream) {
  const rl = readline.createInterface({
    input: mappingsStream,
    crlfDelay: Infinity
  })

  const classes = {}
  const fields = {}
  const methods = {}

  for await (const line of rl) {
    if (line.startsWith('c')) {
      const [ _section, _classNameA, classNameB, extraNSClassNames ] = line.split('\t')
      classes[classNameB] = extraNSClassNames
    }
    if (line.startsWith('\t')) {
      const substr = line.substring(1, line.length)
      if (substr.startsWith('f')) {
        const [ _section, _fieldDescA, _fieldNameA, fieldNameB, extraNSFieldNames ] = substr.split('\t')
        fields[fieldNameB] = extraNSFieldNames
      } else if (substr.startsWith('m')) {
        const [ _section, _methodDescA, _methodNameA, methodNameB, extraNSMethodNames ] = substr.split('\t')
        methods[methodNameB] = extraNSMethodNames
      }
    }
  }

  return {
    mappedClasses: classes,
    mappedFields: fields,
    mappedMethods: methods,
  }
}

function remapDescriptor(descriptor, mappedClasses) {
  const objDescriptorRegex = /L[\w/$]+;/g
  const objDescriptors = descriptor.match(objDescriptorRegex)
  if (!objDescriptors) return descriptor
  for (const objDescriptor of objDescriptors) {
    const object = objDescriptor.substring(1, objDescriptor.length - 1) // remove "L" and ";"
    if (!object.startsWith('net/minecraft')) return descriptor
    descriptor = descriptor.replace(objDescriptor, `L${mappedClasses[object]};`)
  }
  return descriptor
}

function remapLine(line, mappedClasses, mappedFields, mappedMethods) {
  const [ _access, fType ] = line.split('\t')
  switch (fType) {
    case 'class':
      var [ access, type, intermediary ] = line.split('\t')
      line = [ access, type, mappedClasses[intermediary] ].join('\t')
      break
    case 'method':
      var [ access, type, intermediaryClass, intermediary, descriptor ] = line.split('\t')
      line = [
        access,
        type,
        mappedClasses[intermediaryClass],
        mappedMethods[intermediary],
        remapDescriptor(descriptor, mappedClasses)
      ].join('\t')
      break
    case 'field':
      var [ access, type, intermediaryClass, intermediary, descriptor ] = line.split('\t')
      line = [
        access,
        type,
        mappedClasses[intermediaryClass],
        mappedFields[intermediary],
        remapDescriptor(descriptor, mappedClasses)
      ].join('\t')
      break
  }
  return line
}

async function main() {
  if (!mappingsFile || !inputFile || !outputFile) {
    console.log('Usage: <mappings file> <input> <output>')
    return
  }

  const mappingsStream = fs.createReadStream(mappingsFile)
  const input = fs.createReadStream(inputFile)
  const output = fs.createWriteStream(outputFile)

  const { mappedClasses, mappedFields, mappedMethods } = await processMappings(mappingsStream)
  
  const rl = readline.createInterface({
    input: input,
    output: output,
    crlfDelay: Infinity
  })

  rl.on('line', (line) => {
    let modifiedLine = line
    if (line.startsWith('accessWidener')) {
      modifiedLine = line.replace('intermediary', 'named')
    } else if (!line.startsWith('#')) {
      modifiedLine = remapLine(line, mappedClasses, mappedFields, mappedMethods)
    }
    output.write(modifiedLine + '\n')
  })

  rl.on('close', () => {
    input.close()
    output.close()
  })
}

main()