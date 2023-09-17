const fs = require('fs')
const readline = require('readline')

const mappingsFile = process.argv[2]
const inputFile = process.argv[3]
const outputFile = process.argv[4]

// process tinyv2 mappings and create a maps for mapped classes, fields, and methods
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
  const objDescriptorRegex = /L[\w/$]+;/g // match object descriptors, for example: Lnet/minecraft/client/main/Minecraft;
  const objDescriptors = descriptor.match(objDescriptorRegex)
  if (!objDescriptors) return descriptor
  for (const objDescriptor of objDescriptors) {
    const object = objDescriptor.substring(1, objDescriptor.length - 1) // remove "L" and ";"
    if (!object.startsWith('net/minecraft') && !object.startsWith('com/mojang')) return descriptor
    descriptor = descriptor.replace(objDescriptor, `L${mappedClasses[object]};`)
  }
  return descriptor
}

// remap intermediary to named for every line
function remapLine(line, mappedClasses, mappedFields, mappedMethods) {
  switch (line.split('\t')[1]) { // get the mapping type
    case 'class':
      var [ access, type, intermediary ] = line.split('\t')
      var mappedClass = mappedClasses[intermediary] != null ?  mappedClasses[intermediary] : intermediary
      line = [
        access,
        type,
        mappedClass
      ].join('\t')
      break
    case 'method':
      var [ access, type, intermediaryClass, intermediary, descriptor ] = line.split('\t')
      var mappedClass = mappedClasses[intermediaryClass] != null ?  mappedClasses[intermediaryClass] : intermediaryClass
      var mappedMethod = mappedMethods[intermediary] != null ?  mappedMethods[intermediary] : intermediary
      var remappedDescriptor = remapDescriptor(descriptor, mappedClasses)
      line = [
        access,
        type,
        mappedClass,
        mappedMethod,
        remappedDescriptor
      ].join('\t')
      break
    case 'field':
      var [ access, type, intermediaryClass, intermediary, descriptor ] = line.split('\t')
      var mappedClass = mappedClasses[intermediaryClass] != null ?  mappedClasses[intermediaryClass] : intermediaryClass
      var mappedField = mappedFields[intermediary] != null ?  mappedFields[intermediary] : intermediary
      var remappedDescriptor = remapDescriptor(descriptor, mappedClasses)
      line = [
        access,
        type,
        mappedClass,
        mappedField,
        remappedDescriptor
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