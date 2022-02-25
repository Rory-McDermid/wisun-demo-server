//insert a random datapoint for each sensor to mock_II

const {InfluxDB, Point} = require('@influxdata/influxdb-client')
var config = require('./config.json');

// You can generate an API token from the "API Tokens Tab" in the UI
const token = config.influxDB.token;
const org = 'rmm180000@utdallas.edu'
const bucket = 'mock_II'

const client = new InfluxDB({url: 'https://us-east-1-1.aws.cloud2.influxdata.com', token: token})

//const {Point} = require('@influxdata/influxdb-client')
const writeApi = client.getWriteApi(org, bucket)
writeApi.useDefaultTags({host: 'host1'})

//const point = new Point('mem').tag('sensor',1).floatField('used_percent', 73.58452)
//writeApi.writePoint(point)

p1 = new Point('noiseReading').tag('sensor',1).floatField('value',Math.random()*10)
p2 = new Point('noiseReading').tag('sensor',2).floatField('value',Math.random()*10)
p3 = new Point('noiseReading').tag('sensor',3).floatField('value',Math.random()*10)
writeApi.writePoint(p1)
writeApi.writePoint(p2)
writeApi.writePoint(p3)
p1 = new Point('motionReading').tag('sensor',1).booleanField('value',Math.random()>.5)
p2 = new Point('motionReading').tag('sensor',2).booleanField('value',Math.random()>.5)
p3 = new Point('motionReading').tag('sensor',3).booleanField('value',Math.random()>.5)
writeApi.writePoint(p1)
writeApi.writePoint(p2)
writeApi.writePoint(p3)

writeApi
    .close()
    .then(() => {
        console.log('FINISHED')
    })
    .catch(e => {
        console.error(e)
        console.log('Finished ERROR')
    })
