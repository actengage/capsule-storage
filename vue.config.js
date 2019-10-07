// vue.config.js
module.exports = {
    configureWebpack: {
        devServer: {
            // clientLogLevel: 'info',
            watchOptions: {
                poll: true
            }
        },
        output: {
            libraryExport: 'default'
        },
        plugins:[
        ],
    },
    pages: {
        index: {
            // entry for the page
            entry: './src/main.js',
            // the source template
            template: './public/index.html',
            // the output filename
            filename: 'index.html'
        }
    },
    publicPath: '/',
    outputDir: './dist',
    assetsDir: './src/assets',
};