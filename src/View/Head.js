import React, { Component } from 'react';
import PropTypes from 'prop-types';

export default class Head extends Component {
    render() {
        const { title, metas } = this.props;

        const metaTags = [];
        for (const key in metas) {
            metaTags.push(<meta key={key} name={key} content={metas[key]} />);
        }
        return (
            <head>
                {[<title key="title">{title}</title>].concat(metaTags)}
            </head>
        );
    }
}

Head.propTypes = {
    title: PropTypes.string.isRequired,
    metas: PropTypes.object
};

Head.defaultProps = {
    metas: {}
};