const path = require('path');

const HtmlWebpackPlugin = require('html-webpack-plugin');
const HtmlWebpackPluginConfig = new HtmlWebpackPlugin({
  template: './app/static/index.html',
  filename: 'index.html',
  inject: 'body'
});

module.exports = {
  entry: './app/js/index.js',
  output: {
    path: path.resolve('dist'),
    filename: 'index_bundle.js'
  },
  module: {
    // disable babel for testing
    // loaders: [{
    //   test: /\.js$/,
    //   loader: 'babel-loader',
    //   exclude: /node_modules/
    // }]
  },
  plugins: [HtmlWebpackPluginConfig],
  resolve: { 
    // temp fix for using d3 and d3-selection-multi together
    alias: {
      'd3': 'd3/index.js'
    }
   }
};